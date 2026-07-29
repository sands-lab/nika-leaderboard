import { useMemo } from 'react'
import { formatScore } from '../lib/data'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import type { SubmissionSummary } from '../lib/types'

interface EntryPickerProps {
  selected: string[]
  onToggle: (id: string) => void
  onSetSelected: (ids: string[]) => void
  /** Extra line under the name (defaults to model · RCA). */
  subtitle?: (s: SubmissionSummary) => string
}

export function EntryPicker({
  selected,
  onToggle,
  onSetSelected,
  subtitle,
}: EntryPickerProps) {
  const { submissions, filtered } = useLeaderboardData()
  const visible = filtered
  const visibleIds = useMemo(() => visible.map((s) => s.id), [visible])
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))

  const selectAllVisible = () => {
    const next = new Set(selected)
    for (const id of visibleIds) next.add(id)
    onSetSelected([...next])
  }

  const clearVisible = () => {
    const drop = new Set(visibleIds)
    onSetSelected(selected.filter((id) => !drop.has(id)))
  }

  return (
    <section className="picker">
      <div className="picker__header">
        <div>
          <h2>Entries</h2>
          <p className="muted picker__meta">
            Showing {visible.length} of {submissions.length} · {selected.length}{' '}
            selected
          </p>
        </div>
        <div className="picker__actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!visibleIds.length || allVisibleSelected}
            onClick={selectAllVisible}
          >
            Select visible
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!visibleIds.some((id) => selected.includes(id))}
            onClick={clearVisible}
          >
            Clear visible
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!selected.length}
            onClick={() => onSetSelected([])}
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="picker__grid">
        {visible.map((s) => (
          <label key={s.id} className="picker__item">
            <input
              type="checkbox"
              checked={selected.includes(s.id)}
              onChange={() => onToggle(s.id)}
            />
            <span>
              <strong>{s.name}</strong>
              <small>
                {subtitle
                  ? subtitle(s)
                  : `${s.model || '—'} · RCA ${formatScore(s.mean_rca_f1)}`}
              </small>
            </span>
          </label>
        ))}
        {visible.length === 0 && (
          <p className="muted picker__empty">No entries match the filters.</p>
        )}
      </div>
    </section>
  )
}
