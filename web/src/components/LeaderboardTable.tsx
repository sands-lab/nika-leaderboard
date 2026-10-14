import { useMemo, type MouseEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { EntryLinks } from './EntryLinks'
import { SortableTh } from './SortableTh'
import type { SubmissionSummary } from '../lib/types'
import {
  dash,
  entryLinks,
  entryPath,
  formatDateUtc,
  formatCount,
  formatScore,
} from '../lib/data'
import {
  adaptationMethods,
  formatAdaptation,
  scaffoldTags,
  scoreRange,
  type ScoreRange,
  tieCount,
} from '../lib/metrics'
import { modelReleaseDate } from '../lib/modelMeta'
import {
  providerDisplayName,
  providerIconSrc,
  resolveProvider,
} from '../lib/providerMeta'
import { sortByAccessors, useTableSort } from '../lib/tableSort'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import {
  BASIS_LABEL,
  formatUsd,
  submissionCost,
  type PriceOverrides,
  type PricingFile,
} from '../lib/pricing'

const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/**
 * Whether the package came from an official release run. The archive requires
 * `run.official: true`, so an unofficial entry is the notable case and is
 * marked as plainly as a verified one.
 */
export function VerifiedMark({ official }: { official: boolean | null }) {
  // Icon only: a word here widens the busiest column enough to push the table
  // off screen. The label lives in the tooltip and the column header.
  return official ? (
    <span
      className="verified-mark verified-mark--yes"
      title="Verified: packaged from an official release run"
      aria-label="verified"
    >
      ✓
    </span>
  ) : (
    <span
      className="verified-mark verified-mark--no"
      title="Not from an official release run; scores are self-reported"
      aria-label="unverified"
    >
      ?
    </span>
  )
}

interface LeaderboardTableProps {
  rows: SubmissionSummary[]
}

type LbSortKey =
  | 'rank'
  | 'model'
  | 'model_release'
  | 'harness'
  | 'adaptation'
  | 'provider'
  | 'rca'
  | 'loc'
  | 'detection'
  | 'cost'

/**
 * Five steps from worst to best of the entries shown, on a diverging scale:
 * rose for the bad end, cyan for the good end, neutral grey in the middle.
 * Two opposed hues read as worse/better at a glance and stay apart for
 * colour-blind readers, which red/green would not. Steps split the column's
 * observed range evenly, so near-equal scores share a step rather than being
 * forced apart by rank. The range is never taken as narrower than
 * MIN_SCORE_SPAN, about twice the run-to-run margin: a column whose scores
 * all sit within the noise reads as mid-range, not as a best and a worst.
 */
const MIN_SCORE_SPAN = 0.15

const SCORE_TIERS = [
  { key: 'poor', label: 'near the worst' },
  { key: 'weak', label: 'below the middle' },
  { key: 'mid', label: 'mid-range' },
  { key: 'good', label: 'above the middle' },
  { key: 'top', label: 'near the best' },
] as const

function scoreTier(value: number, range: ScoreRange): (typeof SCORE_TIERS)[number] {
  const span = Math.max(range.max - range.min, MIN_SCORE_SPAN)
  const t = 0.5 + (value - (range.min + range.max) / 2) / span
  const i = Math.floor(t * SCORE_TIERS.length)
  return SCORE_TIERS[Math.max(0, Math.min(SCORE_TIERS.length - 1, i))]
}

/**
 * A score as coloured digits, no frame. Given the range of its column (the
 * entries it is compared with), the colour says where it stands; without one
 * it is plain text.
 */
export function ScoreValue({
  value,
  range,
  suffix,
}: {
  value: number | null | undefined
  range?: ScoreRange | null
  /** Shown after the number, e.g. the RCA margin. */
  suffix?: ReactNode
}) {
  if (value == null || Number.isNaN(value)) {
    return <span className="num">—</span>
  }
  const tier = range ? scoreTier(value, range) : null
  return (
    <span className="score">
      <span
        className={`score-value score-value--${tier?.key ?? 'mid'}`}
        title={tier ? `${formatScore(value)} · ${tier.label} of the entries shown` : undefined}
      >
        {formatScore(value)}
      </span>
      {suffix}
    </span>
  )
}

/** What the score tints mean, shown once above the table. */
export function ScoreKey() {
  return (
    <p className="score-key" aria-label="Score colours, relative to the entries shown">
      <span className="score-key__label">Scores vs. entries shown</span>
      <span className="score-key__scale">
        <span className="score-key__end">worse</span>
        {SCORE_TIERS.map((t) => (
          <span key={t.key} className={`score-key__dot score-value--${t.key}`} title={t.label} />
        ))}
        <span className="score-key__end">better</span>
      </span>
    </p>
  )
}

/**
 * The first three ranks get a medal icon and gold, silver or bronze digits,
 * unframed; shared ranks share a medal. Later ranks are plain numbers.
 */
export function RankBadge({ rank }: { rank: number | undefined }) {
  if (rank == null) return <span className="rank-num">—</span>
  if (rank > 3) return <span className="rank-num">{rank}</span>
  return (
    <span className={`rank-medal rank-medal--${rank}`} aria-label={`Rank ${rank}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.2 13.2 6.5 22l5.5-3 5.5 3-1.7-8.8" />
        <circle cx="12" cy="8.5" r="6" />
      </svg>
      {rank}
    </span>
  )
}

function rankTitle(s: SubmissionSummary, tied: number): string {
  if (!s.rca_f1_ci) return 'Ranked by score alone (no per-trial results)'
  return tied > 1
    ? `Tied with ${tied - 1} other ${tied === 2 ? 'entry' : 'entries'}: the score gap is within run-to-run noise`
    : 'Clearly ahead of every entry ranked below it'
}

/** Half-width of the 95% CI, shown as "± x" like most leaderboards. */
function ciHalfWidth(ci: [number, number]): number {
  return (ci[1] - ci[0]) / 2
}

export function RcaCell({
  s,
  range,
}: {
  s: SubmissionSummary
  range?: ScoreRange | null
}) {
  const ci = s.rca_f1_ci
  return (
    <span
      className="rca-cell"
      title={
        ci
          ? `On a fresh set of cases, this score would land between ${formatScore(ci[0], 2)} and ${formatScore(ci[1], 2)} 95% of the time`
          : 'No per-trial results, so no uncertainty estimate'
      }
    >
      <ScoreValue
        value={s.mean_rca_f1}
        range={range}
        suffix={ci && <span className="ci-range">± {formatScore(ciHalfWidth(ci), 2)}</span>}
      />
    </span>
  )
}

export function ProviderIcon({
  llmProvider,
  model,
}: {
  llmProvider: string | null | undefined
  model: string | null | undefined
}) {
  const provider = resolveProvider(llmProvider, model)
  if (!provider) return <span className="muted">—</span>
  const src = providerIconSrc(provider)
  const label = providerDisplayName(provider)
  if (!src) {
    return (
      <span className="provider-fallback" title={label}>
        {label}
      </span>
    )
  }
  return (
    <span className="provider-icon" title={label}>
      <img src={src} alt={label} width={18} height={18} loading="lazy" />
      <span className="visually-hidden">{label}</span>
    </span>
  )
}

export function HarnessCell({ s }: { s: SubmissionSummary }) {
  const tags = scaffoldTags(s)
  return (
    <div className="scaffold-cell">
      <span className="scaffold-cell__name">{dash(s.framework)}</span>
      {tags.length > 0 && (
        <span className="scaffold-cell__tags">
          {tags.map((tag) => (
            <span key={tag} className="scaffold-tag">
              {tag}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

function buildAccessors(
  pricing: PricingFile | null,
  overrides: PriceOverrides,
): Record<LbSortKey, (s: SubmissionSummary) => unknown> {
  return {
    // Within a shared rank, list the higher point estimate first.
    rank: (s) => (s.rank ?? 0) - (s.mean_rca_f1 ?? 0) / 2,
    model: (s) => s.model,
    model_release: (s) => modelReleaseDate(s.model)?.getTime() ?? null,
    harness: (s) => s.framework,
    adaptation: (s) => formatAdaptation(s),
    provider: (s) => resolveProvider(s.llm_provider, s.model),
    rca: (s) => s.mean_rca_f1,
    loc: (s) => s.mean_localization_f1,
    detection: (s) => s.mean_detection_score,
    cost: (s) => submissionCost(s, pricing, overrides)?.perRun ?? null,
  }
}

/** The cost cell: dollars on screen, the tokens and unit price behind it. */
export function CostCell({
  s,
  pricing,
  overrides,
}: {
  s: SubmissionSummary
  pricing: PricingFile | null
  overrides: PriceOverrides
}) {
  const cost = submissionCost(s, pricing, overrides)
  // A zero cost is a real figure, not a missing one: only a null means the
  // package has no token totals or the model has no price.
  if (cost?.perRun == null) {
    return (
      <span
        className="num"
        title={
          (s.token_totals?.in_tokens ?? 0) > 0 ||
          (s.token_totals?.out_tokens ?? 0) > 0
            ? `No price on file for ${s.model ?? 'this model'}`
            : 'This package reports no token accounting'
        }
      >
        —
      </span>
    )
  }
  const inTok = s.token_totals?.in_tokens ?? 0
  const outTok = s.token_totals?.out_tokens ?? 0
  const tip = [
    s.case_count
      ? `One run = all ${NUM.format(s.case_count)} cases once`
      : 'One run = every case once',
    '',
    `${formatCount(s.mean_tokens)} tokens per case`,
    cost.perCase != null ? `${formatUsd(cost.perCase)} per case` : null,
    `${s.model ?? 'model'} at ${formatUsd(cost.price.input)} in / ${formatUsd(
      cost.price.output,
    )} out per 1M tokens`,
    cost.edited ? 'price edited in this browser' : BASIS_LABEL[cost.price.basis],
    '',
    `This submission repeated the run ${s.n_trials ?? '?'}x:`,
    `${NUM.format(inTok)} in + ${NUM.format(outTok)} out, ${formatUsd(
      cost.total,
    )} in total`,
  ]
    .filter((l) => l !== null)
    .join('\n')
  return <span title={tip}>{formatUsd(cost.perRun)}</span>
}

export function LeaderboardTable({ rows }: LeaderboardTableProps) {
  const { pricing, overrides } = useLeaderboardData()
  const navigate = useNavigate()
  const { search } = useLocation()
  const { sort, toggle } = useTableSort<LbSortKey>(
    { key: 'rank', dir: 'asc' },
    'desc',
    // Cheaper is better, so these lead with their best row.
    { cost: 'asc', rank: 'asc' },
  )
  const sorted = useMemo(
    () => sortByAccessors(rows, sort, buildAccessors(pricing, overrides)),
    [rows, sort, pricing, overrides],
  )
  const ranges = useMemo(
    () => ({
      detection: scoreRange(rows.map((s) => s.mean_detection_score)),
      loc: scoreRange(rows.map((s) => s.mean_localization_f1)),
      rca: scoreRange(rows.map((s) => s.mean_rca_f1)),
    }),
    [rows],
  )

  // The whole row opens the entry; links inside it keep their own target.
  // The model name is the keyboard- and middle-click-reachable link.
  const openRow = (e: MouseEvent, s: SubmissionSummary) => {
    if ((e.target as HTMLElement).closest('a, button')) return
    if (window.getSelection()?.toString()) return
    navigate({ pathname: entryPath(s.id), search })
  }

  return (
    <>
    <div className="table-wrap">
      <table className="data-table data-table--entries">
        <thead>
          <tr>
            <SortableTh
              label="Rank"
              sortKey="rank"
              sort={sort}
              onSort={toggle}
              title="Entries marked = are tied: their scores are too close to separate reliably"
              className="w-rank"
            />
            <SortableTh
              label="Model"
              sortKey="model"
              sort={sort}
              onSort={toggle}
              title="Click a row for the entry's full details. ✓ = packaged from an official release run; ? = self-reported"
              className="model-th"
            />
            <SortableTh
              label="Released"
              sortKey="model_release"
              sort={sort}
              onSort={toggle}
              title="Public model release date"
              className="w-released col-secondary"
            />
            <SortableTh
              label="Harness"
              sortKey="harness"
              sort={sort}
              onSort={toggle}
              title="Agent harness that drove the model (e.g. ReACT, LangGraph, Claude Code)"
              className="w-harness col-narrow-hide"
            />
            <SortableTh
              label="Adaptation"
              sortKey="adaptation"
              sort={sort}
              onSort={toggle}
              title="Pre-benchmark optimization / training (e.g. None, GEPA, SFT, RL)"
              className="w-adaptation col-narrow-hide"
            />
            <SortableTh
              label="Provider"
              sortKey="provider"
              sort={sort}
              onSort={toggle}
              title="Model vendor"
              className="w-provider col-secondary"
            />
            <SortableTh
              label="Detection"
              sortKey="detection"
              sort={sort}
              onSort={toggle}
              className="w-score col-secondary"
            />
            <SortableTh
              label="Loc F1"
              sortKey="loc"
              sort={sort}
              onSort={toggle}
              className="w-score col-secondary"
            />
            <SortableTh
              label="RCA F1"
              sortKey="rca"
              sort={sort}
              onSort={toggle}
              title="Mean RCA F1, the metric the leaderboard ranks by. ± is the run-to-run margin: on a fresh set of cases the score would land within it 95% of the time"
              className="w-rca"
            />
            <SortableTh
              label="Cost"
              sortKey="cost"
              sort={sort}
              onSort={toggle}
              title="USD to run the whole benchmark once at the model's reference price. Hover a cell for the per-case figures and what this submission spent in total."
              className="w-cost"
            />
            <th className="w-links col-narrow-hide">Links</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const release = modelReleaseDate(s.model)
            const adapted = adaptationMethods(s)
            return (
              <tr
                key={s.id}
                className="entry-row"
                onClick={(e) => openRow(e, s)}
              >
                <td className="rank-td" title={rankTitle(s, tieCount(rows, s))}>
                  {/* A fixed slot for the tie mark keeps badges and numbers aligned. */}
                  <span className="rank-cell">
                    <RankBadge rank={s.rank} />
                    <span className="rank-tie" aria-label={s.rca_f1_ci && tieCount(rows, s) > 1 ? 'tied' : undefined}>
                      {s.rca_f1_ci && tieCount(rows, s) > 1 ? '=' : ''}
                    </span>
                  </span>
                </td>
                <td className="model-td">
                  <Link
                    className="model-name"
                    to={{ pathname: entryPath(s.id), search }}
                    title={`${s.name}: view details`}
                  >
                    {dash(s.model)}
                  </Link>
                  <VerifiedMark official={s.official} />
                </td>
                <td className="num col-secondary">{formatDateUtc(release)}</td>
                <td className="col-narrow-hide">
                  <HarnessCell s={s} />
                </td>
                <td
                  className={`col-narrow-hide adaptation-td${adapted.length === 0 ? ' adaptation-td--none' : ''}`}
                >
                  {formatAdaptation(s)}
                </td>
                <td className="col-secondary">
                  <ProviderIcon llmProvider={s.llm_provider} model={s.model} />
                </td>
                <td className="num col-secondary">
                  <ScoreValue value={s.mean_detection_score} range={ranges.detection} />
                </td>
                <td className="num col-secondary">
                  <ScoreValue value={s.mean_localization_f1} range={ranges.loc} />
                </td>
                <td className="num">
                  <RcaCell s={s} range={ranges.rca} />
                </td>
                <td className="num">
                  <CostCell s={s} pricing={pricing} overrides={overrides} />
                </td>
                <td className="col-narrow-hide">
                  <EntryLinks links={entryLinks(s)} />
                </td>
              </tr>
            )
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={11} className="empty-row">
                No submissions match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </>
  )
}
