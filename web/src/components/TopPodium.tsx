import { formatScore } from '../lib/data'
import { formatAdaptation, scaffoldTags } from '../lib/metrics'
import type { SubmissionSummary } from '../lib/types'

interface TopPodiumProps {
  rows: SubmissionSummary[]
}

function PodiumCard({
  entry,
  place,
}: {
  entry: SubmissionSummary
  place: 1 | 2 | 3
}) {
  const tags = scaffoldTags(entry)
  const adaptation = formatAdaptation(entry)
  const title = entry.name || entry.model || ''
  // Submission names are usually "<model> <scaffold>", so spelling the model and
  // scaffold out underneath just repeats the title. Keep only what it omits.
  const said = title.toLowerCase()
  const metaParts = [
    entry.model,
    entry.framework,
    ...tags,
    adaptation !== 'None' ? adaptation : null,
  ].filter(
    (part): part is string =>
      Boolean(part) && !said.includes(String(part).toLowerCase()),
  )
  return (
    <article
      className={`podium-card podium-card--${place}`}
      style={{ animationDelay: `${(place - 1) * 90}ms` }}
    >
      <div className="podium-card__cover" aria-hidden="true">
        <span className="podium-card__place">#{place}</span>
        <span className="podium-card__glow" />
      </div>
      <div className="podium-card__body">
        <p className="podium-card__eyebrow">Top {place}</p>
        <h2 className="podium-card__title" title={title}>
          {title}
        </h2>
        {metaParts.length > 0 && (
          <p className="podium-card__meta">{metaParts.join(' · ')}</p>
        )}
        <p className="podium-card__score">
          <span className="podium-card__score-value">
            {formatScore(entry.mean_rca_f1)}
          </span>
          <span className="podium-card__score-label">RCA F1</span>
        </p>
      </div>
    </article>
  )
}

export function TopPodium({ rows }: TopPodiumProps) {
  const top = rows.slice(0, 3)
  if (top.length === 0) return null

  return (
    <section className="podium" aria-label="Top performing agents">
      {top.map((entry, i) => (
        <PodiumCard
          key={entry.id}
          entry={entry}
          place={(i + 1) as 1 | 2 | 3}
        />
      ))}
    </section>
  )
}
