import { formatScore } from '../lib/data'
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
  const meta = [entry.model, entry.framework].filter(Boolean).join(' · ')
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
        <h2 className="podium-card__title">{entry.name}</h2>
        {meta && <p className="podium-card__meta">{meta}</p>}
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
