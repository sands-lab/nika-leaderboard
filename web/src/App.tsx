import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LeaderboardDataProvider } from './lib/LeaderboardDataContext'
import { AnalyzePage } from './pages/AnalyzePage'
import { AnalyticsLayout } from './pages/AnalyticsLayout'
import { ComparePage } from './pages/ComparePage'
import { ConfusionPage } from './pages/ConfusionPage'
import { InsightsPage } from './pages/InsightsPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { MatrixPage } from './pages/MatrixPage'

function RedirectPreserve({ to }: { to: string }) {
  const location = useLocation()
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />
}

/**
 * A hash router, because the site is served from a subfolder of another
 * repository's Pages site. GitHub Pages only falls back to the 404.html at the
 * site root, so a path like /nika/leaderboard/analytics/insights never reached
 * this app and returned GitHub's own error page — every deep link and every
 * reload away from the index was dead. Routes live after the hash, which the
 * server never sees, so they resolve without any fallback.
 *
 * No basename: the subfolder is in the path, the route is in the hash.
 */
export default function App() {
  return (
    <HashRouter>
      <LeaderboardDataProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<LeaderboardPage />} />
            <Route path="analytics" element={<AnalyticsLayout />}>
              <Route index element={<Navigate to="insights" replace />} />
              <Route path="insights" element={<InsightsPage />} />
              <Route path="compare" element={<ComparePage />} />
              <Route path="matrix" element={<MatrixPage />} />
              <Route path="confusion" element={<ConfusionPage />} />
              <Route path="analyze" element={<AnalyzePage />} />
            </Route>
            <Route
              path="insights"
              element={<RedirectPreserve to="/analytics/insights" />}
            />
            <Route
              path="compare"
              element={<RedirectPreserve to="/analytics/compare" />}
            />
            <Route
              path="matrix"
              element={<RedirectPreserve to="/analytics/matrix" />}
            />
            <Route
              path="confusion"
              element={<RedirectPreserve to="/analytics/confusion" />}
            />
            <Route
              path="analyze"
              element={<RedirectPreserve to="/analytics/analyze" />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </LeaderboardDataProvider>
    </HashRouter>
  )
}
