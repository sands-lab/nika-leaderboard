import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { FilterShell } from '../components/FilterShell'

const ANALYTICS_LINKS = [
  { to: 'insights', label: 'Performance Bubbles' },
  { to: 'compare', label: 'Compare Entries' },
  { to: 'matrix', label: 'Case Matrix' },
  { to: 'confusion', label: 'RCA Confusion' },
  { to: 'analyze', label: 'Score Trends' },
] as const

export function AnalyticsLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const segment = location.pathname.split('/').filter(Boolean).pop() || 'insights'
  const selectValue = ANALYTICS_LINKS.some((l) => l.to === segment)
    ? segment
    : 'insights'

  return (
    <div className="analytics-page">
      <FilterShell />

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
