import { NavLink, Outlet } from 'react-router-dom'
import { FiltersBar } from './FiltersBar'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'

export function Layout() {
  const { meta, filters, setFilters, filtered, submissions, loading, error } =
    useLeaderboardData()

  return (
    <div className="app-shell">
      <div className="bg-grid" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            N
          </span>
          <div className="brand__text">
            <strong className="brand__title">NIKA</strong>
            <span className="brand__sub">Leaderboard</span>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Leaderboard
          </NavLink>
          <NavLink to="/insights">Performance Bubbles</NavLink>
          <NavLink to="/compare">Compare Entries</NavLink>
          <NavLink to="/matrix">Case Matrix</NavLink>
          <NavLink to="/confusion">RCA Confusion</NavLink>
          <NavLink to="/analyze">Score Trends</NavLink>
        </nav>
        <a
          className="topbar__link"
          href="https://github.com/sands-lab/nika"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </header>

      {!loading && !error && meta && (
        <div className="shared-filters">
          <FiltersBar
            filters={filters}
            metaFilters={meta.filters}
            versions={meta.versions}
            onChange={setFilters}
          />
          <p className="muted shared-filters__count">
            {filtered.length} / {submissions.length} submissions match filters
          </p>
        </div>
      )}

      <main className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <span>
          Validated packages in <code>submissions/</code>
        </span>
        <span className="footer__dot" aria-hidden="true" />
        <span>Primary metric: mean RCA F1</span>
      </footer>
    </div>
  )
}
