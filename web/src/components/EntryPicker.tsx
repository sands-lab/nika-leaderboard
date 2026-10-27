import { useMemo } from 'react'
import { formatScore } from '../lib/data'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import type { SubmissionSummary } from '../lib/types'
import { MultiSelect } from './MultiSelect'

interface EntryPickerProps {
  selected: string[]
  onSetSelected: (ids: string[]) => void
  /** Extra line under the name (defaults to model · RCA). */
  subtitle?: (s: SubmissionSummary) => string
}

/** Which entries a page compares, as a dropdown of checkboxes. */
export function EntryPicker({
  selected,
  onSetSelected,
  subtitle,
}: EntryPickerProps) {
  const { submissions, filtered } = useLeaderboardData()
  const options = useMemo(() => {
    const hint = (s: SubmissionSummary) =>
      subtitle ? subtitle(s) : `${s.model || '—'} · RCA ${formatScore(s.mean_rca_f1)}`
    const shown = new Set(filtered.map((s) => s.id))
    // A ticked entry the filters now hide stays listed, so it can be unticked.
    const hidden = submissions.filter(
      (s) => selected.includes(s.id) && !shown.has(s.id),
    )
    return [
      ...filtered.map((s) => ({ value: s.id, label: s.name, hint: hint(s) })),
      ...hidden.map((s) => ({
        value: s.id,
        label: s.name,
        hint: `${hint(s)} · hidden by filters`,
      })),
    ]
  }, [filtered, submissions, selected, subtitle])

  // "Select all" acts on the entries the search left in the list.
  const selectShown = (ids: string[]) =>
    onSetSelected([...new Set([...selected, ...ids])])

  return (
    <section className="picker">
      <div className="filter picker__control" role="group" aria-label="Entries">
        <span>Entries</span>
        <MultiSelect
          ariaLabel="Entries"
          allLabel="None selected"
          noun="entries selected"
          searchable
          selected={selected}
          onChange={onSetSelected}
          options={options}
          emptyText="No entries match the filters."
          actions={(shown) => (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={shown.every((o) => selected.includes(o.value))}
                onClick={() => selectShown(shown.map((o) => o.value))}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!selected.length}
                onClick={() => onSetSelected([])}
              >
                Clear
              </button>
            </>
          )}
        />
      </div>
      <p className="muted picker__meta">
        {selected.length} selected · {filtered.length} of {submissions.length}{' '}
        entries match the filters
      </p>
    </section>
  )
}
