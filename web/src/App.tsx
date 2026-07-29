import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LeaderboardDataProvider } from './lib/LeaderboardDataContext'
import { AnalyzePage } from './pages/AnalyzePage'
import { ComparePage } from './pages/ComparePage'
import { ConfusionPage } from './pages/ConfusionPage'
import { InsightsPage } from './pages/InsightsPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { MatrixPage } from './pages/MatrixPage'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <LeaderboardDataProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<LeaderboardPage />} />
            <Route path="insights" element={<InsightsPage />} />
            <Route path="compare" element={<ComparePage />} />
            <Route path="matrix" element={<MatrixPage />} />
            <Route path="confusion" element={<ConfusionPage />} />
            <Route path="analyze" element={<AnalyzePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </LeaderboardDataProvider>
    </BrowserRouter>
  )
}
