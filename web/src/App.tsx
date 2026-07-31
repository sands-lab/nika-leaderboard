import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
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

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
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
    </BrowserRouter>
  )
}
