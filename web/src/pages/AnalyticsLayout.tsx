import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { FiltersBar } from '../components/FiltersBar'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'

const ANALYTICS_LINKS = [
  { to: 'insights', label: 'Performance Bubbles' },
  { to: 'compare', label: 'Compare Entries' },
  { to: 'matrix', label: 'Case Matrix' },
  { to: 'confusion', label: 'RCA Confusion' },
  { to: 'analyze', label: 'Score Trends' },
] as const

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

export function AnalyticsLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const narrow = useNarrowViewport()
  const [filtersOpen, setFiltersOpen] = useState(!narrow)
  const { meta, filters, setFilters, filtered, submissions, loading, error } =
    useLeaderboardData()
  const segment = location.pathname.split('/').filter(Boolean).pop() || 'insights'
  const selectValue = ANALYTICS_LINKS.some((l) => l.to === segment)
    ? segment
    : 'insights'

  useEffect(() => {
    setFiltersOpen(!narrow)
  }, [narrow])

  return (
    <div className="analytics-page">
      {!loading && !error && meta && (
        <div className="analytics-filters">
          <div className="analytics-filters__bar">
            <p className="muted analytics-filters__count">
              {filtered.length} / {submissions.length} submissions match filters
            </p>
            {narrow && (
              <button
                type="button"
                className="btn btn--ghost analytics-filters__toggle"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((v) => !v)}
              >
                {filtersOpen ? 'Hide filters' : 'Show filters'}
              </button>
            )}
          </div>
          {(filtersOpen || !narrow) && (
            <FiltersBar
              filters={filters}
              metaFilters={meta.filters}
              versions={meta.versions}
              onChange={setFilters}
            />
          )}
        </div>
      )}

      <div className="analytics-shell">
        <aside className="analytics-sidebar" aria-label="Advanced analytics">
          <p className="analytics-sidebar__title">Analytics</p>
          <label className="analytics-select">
            <span className="visually-hidden">Analytics section</span>
            <select
              value={selectValue}
              onChange={(e) => navigate(`/analytics/${e.target.value}`)}
            >
              {ANALYTICS_LINKS.map((link) => (
                <option key={link.to} value={link.to}>
                  {link.label}
                </option>
              ))}
            </select>
          </label>
          <nav className="analytics-nav">
            {ANALYTICS_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="analytics-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
