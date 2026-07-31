import { NavLink, Outlet } from 'react-router-dom'

export function Layout() {
  return (
    <div className="app-shell">
      <div className="bg-grid" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          <div className="brand__text">
            <strong className="brand__title">
              <span className="brand__n">N</span>
              <span className="brand__ika">IKA</span>
            </strong>
            <span className="brand__sub">Leaderboard</span>
          </div>
        </div>
        <a
          className="topbar__link"
          href="https://github.com/sands-lab/nika"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
        <nav className="nav" aria-label="Primary">
          <NavLink to="/" end>
            Leaderboard
          </NavLink>
          <NavLink to="/analytics">Advanced Analytics</NavLink>
        </nav>
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
