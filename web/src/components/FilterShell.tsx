import { useEffect, useState } from 'react'
import { FiltersBar } from './FiltersBar'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'

function useNarrowViewport(query = '(max-width: 800px)') {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return narrow
}

/**
 * The shared filter bar. Filter state lives in one context for the whole app,
 * so every page that consumes it has to show it — otherwise a filter set on
 * one page silently shrinks another page that offers no way to undo it.
 */
export function FilterShell() {
  const narrow = useNarrowViewport()
  const [open, setOpen] = useState(!narrow)
  const { meta, filters, setFilters, filtered, submissions, loading, error } =
    useLeaderboardData()

  useEffect(() => {
    setOpen(!narrow)
  }, [narrow])

  if (loading || error || !meta) return null

  const versionsWithData = new Set(
    submissions.map((s) => s.benchmark_version).filter(Boolean),
  )

  return (
    <div className="analytics-filters">
      {narrow && (
        <div className="analytics-filters__bar">
          <button
            type="button"
            className="btn btn--ghost analytics-filters__toggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide filters' : 'Show filters'}
          </button>
        </div>
      )}
      {(open || !narrow) && (
        <FiltersBar
          filters={filters}
          metaFilters={meta.filters}
          versions={meta.versions}
          versionsWithData={versionsWithData}
          onChange={setFilters}
        />
      )}
      {/* The count is what the controls above produced, so it reads after them. */}
      <p className="muted analytics-filters__count">
        {filtered.length} / {submissions.length} submissions match filters
      </p>
    </div>
  )
}
