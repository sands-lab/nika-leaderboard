import { Link, useLocation } from 'react-router-dom'
import { entryPath, formatScore, SCORE_DIGITS } from '../lib/data'
import { adaptationMethods, scaffoldTags } from '../lib/metrics'
import { catalogEntry, formatUsd, modelKey, submissionCost } from '../lib/pricing'
import type { PriceMode, PriceOverrides, PricingFile } from '../lib/pricing'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import type { SubmissionSummary } from '../lib/types'
import { ProviderIcon } from './LeaderboardTable'

type LeaderKind = 'best' | 'open' | 'cheap'

/**
 * Line icons, one per axis, so the tiles are told apart before they are read.
 * Paths are drawn on a 24-unit grid with a 2-unit stroke.
 */
const LEADER_ICONS: Record<LeaderKind, string> = {
  // trophy
  best: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  // unlocked padlock
  open: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2',
  // coin
  cheap: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.8 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6.5V8M12 16v1.5',
}

interface Leader {
  kind: LeaderKind
  /** The question this card answers. */
  axis: string
  entry: SubmissionSummary
  value: string
  unit: string
  /** Why this entry won, for the hover. */
  note: string
}

function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/**
 * One winner per axis rather than the top three on one metric. Ranking the same
 * metric three times only restates the first three table rows directly below;
 * naming the cheapest run and the best open-weight entry answers questions the
 * table's default order does not. Axes are listed in display order.
 */
function pickLeaders(
  rows: SubmissionSummary[],
  pricing: PricingFile | null,
  overrides: PriceOverrides,
  priceMode: PriceMode,
): Leader[] {
  const scored = rows.filter((s) => s.mean_rca_f1 != null)
  if (!scored.length) return []
  const out: Leader[] = []

  const best = scored.reduce((a, b) =>
    (b.mean_rca_f1 ?? 0) > (a.mean_rca_f1 ?? 0) ? b : a,
  )
  out.push({
    kind: 'best',
    axis: 'Top performer',
    entry: best,
    value: formatScore(best.mean_rca_f1, SCORE_DIGITS),
    unit: 'RCA F1',
    note: 'Highest mean RCA F1, the metric the leaderboard ranks by',
  })

  // Open weights are the ones carrying a hosted quote rather than a vendor price.
  const openWeight = scored.filter(
    (s) => catalogEntry(pricing?.models, modelKey(s))?.basis === 'hosted_open_weight',
  )
  if (openWeight.length) {
    const top = openWeight.reduce((a, b) =>
      (b.mean_rca_f1 ?? 0) > (a.mean_rca_f1 ?? 0) ? b : a,
    )
    if (top.id !== best.id) {
      out.push({
        kind: 'open',
      axis: 'Best open weights',
        entry: top,
        value: formatScore(top.mean_rca_f1, SCORE_DIGITS),
        unit: 'RCA F1',
        note: 'Highest RCA F1 among models whose weights are publicly available',
      })
    }
  }

  // Cheapest among entries scoring at or above the median only: the cheapest
  // run overall is usually the one that barely tried.
  const cutoff = median(scored.map((s) => s.mean_rca_f1 ?? 0))
  const priced = scored
    .filter((s) => (s.mean_rca_f1 ?? 0) >= cutoff)
    .map((s) => ({ s, cost: submissionCost(s, pricing, overrides, priceMode)?.perRun ?? null }))
    .filter((x): x is { s: SubmissionSummary; cost: number } => x.cost != null)
  if (priced.length) {
    const cheapest = priced.reduce((a, b) => (b.cost < a.cost ? b : a))
    out.push({
      kind: 'cheap',
      axis: 'Lowest-cost top performer',
      entry: cheapest.s,
      value: formatUsd(cheapest.cost),
      unit: 'est. per run',
      note: `Lowest estimated cost to run the benchmark once, at reference token prices, among entries whose RCA F1 score is at or above the median (${formatScore(cutoff, SCORE_DIGITS)})`,
    })
  }

  return out
}

function LeaderCard({ leader, index }: { leader: Leader; index: number }) {
  const { entry } = leader
  const { search } = useLocation()
  const skills = scaffoldTags(entry)
  const adaptations = adaptationMethods(entry)

  return (
    <article
      className={`leader-card leader-card--${leader.kind}`}
      style={{ animationDelay: `${index * 70}ms` }}
      title={leader.note}
    >
      {/* A stat tile, read top to bottom: the question, the answer, who. */}
      <p className="leader-card__axis">
        <svg className="leader-card__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d={LEADER_ICONS[leader.kind]} />
        </svg>
        {leader.axis}
      </p>
      <p className="leader-card__value">
        <span className="leader-card__number">{leader.value}</span>
        <span className="leader-card__unit">{leader.unit}</span>
      </p>
      <div className="leader-card__who">
        <ProviderIcon llmProvider={entry.llm_provider} model={entry.model} />
        <h2 className="leader-card__name">
          <Link
            to={{ pathname: entryPath(entry.id), search }}
            title={`${entry.name}: view details`}
          >
            {entry.model || entry.name}
          </Link>
        </h2>
        <p className="leader-card__stack">
          <span>{entry.framework || '—'}</span>
          {skills.map((t) => (
            <span key={t} className="scaffold-tag">
              {t}
            </span>
          ))}
          {adaptations.map((m) => (
            <span key={m} className="scaffold-tag scaffold-tag--adapt">
              {m}
            </span>
          ))}
        </p>
      </div>
    </article>
  )
}

export function LeaderCards({ rows }: { rows: SubmissionSummary[] }) {
  const { pricing, overrides, priceMode } = useLeaderboardData()
  const leaders = pickLeaders(rows, pricing, overrides, priceMode)
  if (!leaders.length) return null

  return (
    <section className="leaders" aria-label="Leaders by measure">
      {leaders.map((l, i) => (
        <LeaderCard key={l.axis} leader={l} index={i} />
      ))}
    </section>
  )
}
