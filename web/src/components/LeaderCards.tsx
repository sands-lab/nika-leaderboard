import { formatPct, formatScore } from '../lib/data'
import { adaptationMethods, scaffoldTags } from '../lib/metrics'
import { formatUsd, submissionCost } from '../lib/pricing'
import type { PriceOverrides, PricingFile } from '../lib/pricing'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import type { SubmissionSummary } from '../lib/types'

interface Leader {
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
 * table's default order does not.
 */
function pickLeaders(
  rows: SubmissionSummary[],
  pricing: PricingFile | null,
  overrides: PriceOverrides,
): Leader[] {
  const scored = rows.filter((s) => s.mean_rca_f1 != null)
  if (!scored.length) return []
  const out: Leader[] = []

  const best = scored.reduce((a, b) =>
    (b.mean_rca_f1 ?? 0) > (a.mean_rca_f1 ?? 0) ? b : a,
  )
  out.push({
    axis: 'Best RCA F1',
    entry: best,
    value: formatScore(best.mean_rca_f1),
    unit: 'RCA F1',
    note: 'Highest mean RCA F1, the metric the leaderboard ranks by',
  })

  // Open weights are the ones carrying a hosted quote rather than a vendor price.
  const openWeight = scored.filter(
    (s) => pricing?.models?.[s.model ?? '']?.basis === 'hosted_open_weight',
  )
  if (openWeight.length) {
    const top = openWeight.reduce((a, b) =>
      (b.mean_rca_f1 ?? 0) > (a.mean_rca_f1 ?? 0) ? b : a,
    )
    if (top.id !== best.id) {
      out.push({
        axis: 'Best open weights',
        entry: top,
        value: formatScore(top.mean_rca_f1),
        unit: 'RCA F1',
        note: 'Highest RCA F1 among models whose weights are publicly available',
      })
    }
  }

  // Cheapest among the better half only: the cheapest run overall is usually
  // the one that barely tried.
  const cutoff = median(scored.map((s) => s.mean_rca_f1 ?? 0))
  const priced = scored
    .filter((s) => (s.mean_rca_f1 ?? 0) >= cutoff)
    .map((s) => ({ s, cost: submissionCost(s, pricing, overrides)?.perRun ?? null }))
    .filter((x): x is { s: SubmissionSummary; cost: number } => x.cost != null)
  if (priced.length) {
    const cheapest = priced.reduce((a, b) => (b.cost < a.cost ? b : a))
    out.push({
      axis: 'Cheapest of the better half',
      entry: cheapest.s,
      value: formatUsd(cheapest.cost),
      unit: 'per run',
      note: `Lowest cost to run the benchmark once among entries scoring at or above the median (${formatScore(cutoff)})`,
    })
  }

  const reliable = scored.filter((s) => s.success_rate != null)
  if (reliable.length) {
    const top = reliable.reduce((a, b) =>
      (b.success_rate ?? 0) > (a.success_rate ?? 0) ? b : a,
    )
    out.push({
      axis: 'Most reliable',
      entry: top,
      value: formatPct(top.success_rate),
      unit: 'completed',
      note: 'Largest share of cases the agent finished without failing',
    })
  }

  return out
}

function LeaderCard({ leader, index }: { leader: Leader; index: number }) {
  const { entry } = leader
  const skills = scaffoldTags(entry)
  const adaptations = adaptationMethods(entry)

  return (
    <article
      className="leader-card"
      style={{ animationDelay: `${index * 70}ms` }}
      title={leader.note}
    >
      <p className="leader-card__axis">{leader.axis}</p>
      <div className="leader-card__body">
        <div className="leader-card__who">
          <h2 className="leader-card__name" title={entry.name}>
            {entry.model || entry.name}
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
        <p className="leader-card__value">
          <span className="leader-card__number">{leader.value}</span>
          <span className="leader-card__unit">{leader.unit}</span>
        </p>
      </div>
    </article>
  )
}

export function LeaderCards({ rows }: { rows: SubmissionSummary[] }) {
  const { pricing, overrides } = useLeaderboardData()
  const leaders = pickLeaders(rows, pricing, overrides)
  if (!leaders.length) return null

  return (
    <section className="leaders" aria-label="Leaders by measure">
      {leaders.map((l, i) => (
        <LeaderCard key={l.axis} leader={l} index={i} />
      ))}
    </section>
  )
}
