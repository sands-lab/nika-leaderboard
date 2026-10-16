import { useEffect, useMemo, useRef, type MouseEvent, type ReactNode } from 'react'
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
  SCORE_DIGITS,
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
  priceSourceLines,
  submissionCost,
  type PriceOverrides,
  type PricingFile,
} from '../lib/pricing'
import type { ColumnVisibility } from '../lib/optionalColumns'

const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const COMPACT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

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
  /** Which optional columns the viewer has turned on. */
  columns: ColumnVisibility
}

type LbSortKey =
  | 'rank'
  | 'model'
  | 'model_release'
  | 'harness'
  | 'optimizations'
  | 'user'
  | 'rca'
  | 'loc'
  | 'detection'
  | 'cost'
  | 'in_tokens'
  | 'out_tokens'

type TokenKind = 'in_tokens' | 'out_tokens'

/** Who submitted the entry, as named in its metadata. */
function submitter(s: SubmissionSummary): string | null {
  return s.authors?.trim() || null
}

/**
 * Tokens for one complete pass over the benchmark's cases, scaled from the
 * trials the package reported the same way the cost is, so packages with
 * different repeat counts compare like for like.
 */
function tokensPerRun(s: SubmissionSummary, kind: TokenKind): number | null {
  const total = s.token_totals?.[kind] ?? 0
  const attempts = s.n_trials_present ?? s.n_trials_expected ?? 0
  const cases = s.case_count ?? 0
  if (!(total > 0) || attempts <= 0 || cases <= 0) return null
  return (total / attempts) * cases
}

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
        title={tier ? `${formatScore(value, SCORE_DIGITS)} · ${tier.label} of the entries shown` : undefined}
      >
        {formatScore(value, SCORE_DIGITS)}
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
  margin = true,
}: {
  s: SubmissionSummary
  range?: ScoreRange | null
  /** Show the "± x" margin beside the score; it stays in the tooltip either way. */
  margin?: boolean
}) {
  const ci = s.rca_f1_ci
  return (
    <span
      className="rca-cell"
      title={
        ci
          ? `On a fresh set of cases, this score would land between ${formatScore(ci[0], SCORE_DIGITS)} and ${formatScore(ci[1], SCORE_DIGITS)} 95% of the time`
          : 'No per-trial results, so no uncertainty estimate'
      }
    >
      <ScoreValue
        value={s.mean_rca_f1}
        range={range}
        suffix={margin && ci && <span className="ci-range">± {formatScore(ciHalfWidth(ci), SCORE_DIGITS)}</span>}
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
    optimizations: (s) => formatAdaptation(s),
    user: (s) => submitter(s),
    rca: (s) => s.mean_rca_f1,
    loc: (s) => s.mean_localization_f1,
    detection: (s) => s.mean_detection_score,
    cost: (s) => submissionCost(s, pricing, overrides)?.perRun ?? null,
    in_tokens: (s) => tokensPerRun(s, 'in_tokens'),
    out_tokens: (s) => tokensPerRun(s, 'out_tokens'),
  }
}

/**
 * The estimated-cost cell: dollars on screen, the tokens and reference price
 * behind it. Submitters disclose no spending; this is derived, not reported.
 */
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
  const { price } = cost
  const source = [price.provider, price.retrieved && `retrieved ${price.retrieved}`]
    .filter(Boolean)
    .join(', ')
  const tip = [
    'Estimate from token counts and a reference price, not the submitter\'s spend',
    s.case_count
      ? `One run = all ${NUM.format(s.case_count)} cases once`
      : 'One run = every case once',
    '',
    `${formatCount(s.mean_tokens)} tokens per case`,
    cost.perCase != null ? `${formatUsd(cost.perCase)} per case` : null,
    `${s.model ?? 'model'} at ${formatUsd(price.input)} in / ${formatUsd(
      price.output,
    )} out per 1M tokens`,
    cost.edited
      ? 'price edited in this browser'
      : `${BASIS_LABEL[price.basis]}${source ? ` (${source})` : ''}`,
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

/** Tokens per complete run, compact on screen, exact in the tooltip. */
function TokenCell({ s, kind }: { s: SubmissionSummary; kind: TokenKind }) {
  const perRun = tokensPerRun(s, kind)
  if (perRun == null) {
    return (
      <span className="num" title="This package reports no token accounting">
        —
      </span>
    )
  }
  const word = kind === 'in_tokens' ? 'input' : 'output'
  const tip = [
    `${NUM.format(perRun)} ${word} tokens per run`,
    s.case_count
      ? `One run = all ${NUM.format(s.case_count)} cases once`
      : 'One run = every case once',
    '',
    `This submission repeated the run ${s.n_trials ?? '?'}x:`,
    `${NUM.format(s.token_totals?.[kind] ?? 0)} ${word} tokens in total`,
  ].join('\n')
  return <span title={tip}>{COMPACT.format(perRun)}</span>
}

export function LeaderboardTable({ rows, columns }: LeaderboardTableProps) {
  const { pricing, overrides } = useLeaderboardData()
  const navigate = useNavigate()
  const { search } = useLocation()
  const { sort, toggle } = useTableSort<LbSortKey>(
    { key: 'rank', dir: 'asc' },
    'desc',
    // Cheaper is better, so these lead with their best row.
    { cost: 'asc', rank: 'asc', in_tokens: 'asc', out_tokens: 'asc' },
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
  const costTitle = [
    'Estimated USD to run the whole benchmark once, computed from the entry\'s token counts and reference prices. Submitters do not report costs, and this is not what they paid.',
    '',
    `Reference prices, USD per 1M input/output tokens${pricing?.as_of ? `, as of ${pricing.as_of}` : ''}:`,
    ...priceSourceLines(pricing).map((line) => `• ${line}`),
    '',
    'Hover a cell for the model\'s rate and the per-case figures.',
  ].join('\n')
  // Always-on columns: rank, model, harness, three scores, cost, links.
  const columnCount = 8 + Object.values(columns).filter(Boolean).length

  // Rank and Model stay pinned while the table scrolls sideways. Model is
  // pinned just right of Rank, whose width depends on how spare table width
  // is shared out, so it is measured rather than assumed.
  const wrapRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  useEffect(() => {
    const table = tableRef.current
    const rankTh = table?.querySelector('thead th')
    if (!table || !rankTh) return
    const observer = new ResizeObserver(() => {
      table.style.setProperty(
        '--sticky-model-left',
        `${rankTh.getBoundingClientRect().width}px`,
      )
    })
    observer.observe(rankTh)
    return () => observer.disconnect()
  }, [])

  // The header sticks to the page, just below whatever chrome is pinned above
  // it. That needs a wrapper that is not a scroll container, so the wrapper
  // only scrolls (header pinned inside it instead) once the table is too wide.
  useEffect(() => {
    const wrap = wrapRef.current
    const table = tableRef.current
    if (!wrap || !table) return
    const chrome = Array.from(
      document.querySelectorAll<HTMLElement>('.topbar, .analytics-filters'),
    )
    const update = () => {
      const top = chrome.reduce((max, el) => {
        const style = getComputedStyle(el)
        if (style.position !== 'sticky') return max
        return Math.max(max, (parseFloat(style.top) || 0) + el.getBoundingClientRect().height)
      }, 0)
      wrap.style.setProperty('--sticky-head-top', `${top}px`)
      wrap.classList.toggle('is-overflowing-x', table.scrollWidth > wrap.clientWidth + 1)
    }
    const observer = new ResizeObserver(update)
    for (const el of [wrap, table, ...chrome]) observer.observe(el)
    return () => observer.disconnect()
  }, [])
  // A shadow on the pinned edge only once there is something scrolled under it.
  const onScroll = () => {
    const wrap = wrapRef.current
    wrap?.classList.toggle('is-scrolled-x', wrap.scrollLeft > 0)
  }

  // The whole row opens the entry; links inside it keep their own target.
  // The model name is the keyboard- and middle-click-reachable link.
  const openRow = (e: MouseEvent, s: SubmissionSummary) => {
    if ((e.target as HTMLElement).closest('a, button')) return
    if (window.getSelection()?.toString()) return
    navigate({ pathname: entryPath(s.id), search })
  }

  return (
    <>
    <div className="table-wrap table-wrap--entries" ref={wrapRef} onScroll={onScroll}>
      <table className="data-table data-table--entries" ref={tableRef}>
        <thead>
          <tr>
            <SortableTh
              label="Rank"
              sortKey="rank"
              sort={sort}
              onSort={toggle}
              title="Entries marked = are tied: their scores are too close to separate reliably"
              className="w-rank sticky-rank"
            />
            <SortableTh
              label="Model"
              sortKey="model"
              sort={sort}
              onSort={toggle}
              title="Model, with its vendor's logo. Click a row for the entry's full details. ✓ = packaged from an official release run; ? = self-reported"
              className="model-th sticky-model"
            />
            {columns.released && (
              <SortableTh
                label="Released"
                sortKey="model_release"
                sort={sort}
                onSort={toggle}
                title="Public model release date"
                className="w-released col-secondary"
              />
            )}
            <SortableTh
              label="Harness"
              sortKey="harness"
              sort={sort}
              onSort={toggle}
              title="Agent harness that drove the model (e.g. ReACT, LangGraph, Claude Code)"
              className="w-harness col-narrow-hide"
            />
            {columns.optimizations && (
              <SortableTh
                label="Agent optimizations"
                sortKey="optimizations"
                sort={sort}
                onSort={toggle}
                title="Optimizations applied to the agent before the benchmark run (e.g. None, GEPA, SFT, RL)"
                className="w-optimizations col-narrow-hide"
              />
            )}
            {columns.user && (
              <SortableTh
                label="User"
                sortKey="user"
                sort={sort}
                onSort={toggle}
                title="Who submitted the results, as named in the submission. Shown as anonymous when no name was given."
                className="w-user col-secondary"
              />
            )}
            <SortableTh
              label="RCA"
              sortKey="rca"
              sort={sort}
              onSort={toggle}
              title="Root-cause analysis: mean F1 score of the identified root causes, the metric the leaderboard ranks by. Hover a score for its 95% confidence interval"
              className="w-rca"
            />
            <SortableTh
              label="Localization"
              sortKey="loc"
              sort={sort}
              onSort={toggle}
              title="Fault localization: mean F1 score of the components identified as faulty"
              className="w-score col-secondary"
            />
            <SortableTh
              label="Detection"
              sortKey="detection"
              sort={sort}
              onSort={toggle}
              title="Fault detection: share of cases where the agent correctly said whether a fault is present (accuracy, 0 to 1)"
              className="w-score col-secondary"
            />
            <SortableTh
              label="Est. Cost"
              sortKey="cost"
              sort={sort}
              onSort={toggle}
              title={costTitle}
              className="w-cost"
            />
            {columns.in_tokens && (
              <SortableTh
                label="Input tokens"
                sortKey="in_tokens"
                sort={sort}
                onSort={toggle}
                title="Input tokens to run the whole benchmark once. Hover a cell for the exact count and the submission's total."
                className="w-tokens col-secondary"
              />
            )}
            {columns.out_tokens && (
              <SortableTh
                label="Output tokens"
                sortKey="out_tokens"
                sort={sort}
                onSort={toggle}
                title="Output tokens to run the whole benchmark once. Hover a cell for the exact count and the submission's total."
                className="w-tokens col-secondary"
              />
            )}
            <th className="w-links col-narrow-hide" title="Agent trajectories for this entry on Hugging Face">Datasets</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const release = modelReleaseDate(s.model)
            const adapted = adaptationMethods(s)
            const user = submitter(s)
            return (
              <tr
                key={s.id}
                className="entry-row"
                onClick={(e) => openRow(e, s)}
              >
                <td className="rank-td sticky-rank" title={rankTitle(s, tieCount(rows, s))}>
                  {/* A fixed slot for the tie mark keeps badges and numbers aligned. */}
                  <span className="rank-cell">
                    <RankBadge rank={s.rank} />
                    <span className="rank-tie" aria-label={s.rca_f1_ci && tieCount(rows, s) > 1 ? 'tied' : undefined}>
                      {s.rca_f1_ci && tieCount(rows, s) > 1 ? '=' : ''}
                    </span>
                  </span>
                </td>
                <td className="model-td sticky-model">
                  <span className="model-cell">
                    <ProviderIcon llmProvider={s.llm_provider} model={s.model} />
                    <Link
                      className="model-name"
                      to={{ pathname: entryPath(s.id), search }}
                      title={`${s.name}: view details`}
                    >
                      {dash(s.model)}
                    </Link>
                    <VerifiedMark official={s.official} />
                  </span>
                </td>
                {columns.released && (
                  <td className="num col-secondary">{formatDateUtc(release)}</td>
                )}
                <td className="col-narrow-hide">
                  <HarnessCell s={s} />
                </td>
                {columns.optimizations && (
                  <td
                    className={`col-narrow-hide adaptation-td${adapted.length === 0 ? ' adaptation-td--none' : ''}`}
                  >
                    {formatAdaptation(s)}
                  </td>
                )}
                {columns.user && (
                  <td
                    className={`col-secondary user-td${user ? '' : ' user-td--anonymous'}`}
                    title={s.org ? `${user ?? 'anonymous'} · ${s.org}` : undefined}
                  >
                    {user ?? 'anonymous'}
                  </td>
                )}
                <td className="num">
                  <RcaCell s={s} range={ranges.rca} margin={false} />
                </td>
                <td className="num col-secondary">
                  <ScoreValue value={s.mean_localization_f1} range={ranges.loc} />
                </td>
                <td className="num col-secondary">
                  <ScoreValue value={s.mean_detection_score} range={ranges.detection} />
                </td>
                <td className="num">
                  <CostCell s={s} pricing={pricing} overrides={overrides} />
                </td>
                {columns.in_tokens && (
                  <td className="num col-secondary">
                    <TokenCell s={s} kind="in_tokens" />
                  </td>
                )}
                {columns.out_tokens && (
                  <td className="num col-secondary">
                    <TokenCell s={s} kind="out_tokens" />
                  </td>
                )}
                <td className="col-narrow-hide">
                  <EntryLinks links={entryLinks(s)} />
                </td>
              </tr>
            )
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columnCount} className="empty-row">
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
