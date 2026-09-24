import { useMemo } from 'react'
import { FilterShell } from '../components/FilterShell'
import { LeaderboardTable } from '../components/LeaderboardTable'
import { LeaderCards } from '../components/LeaderCards'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import { exportCsv, withRanks } from '../lib/metrics'

export function LeaderboardPage() {
  const { filtered, pricing, overrides, loading, error } = useLeaderboardData()

  const ranked = useMemo(() => withRanks(filtered), [filtered])

  if (loading) return <p className="status">Loading leaderboard…</p>
  if (error) return <p className="status status--error">{error}</p>

  return (
    <div className="page">
      <FilterShell />

      <div className="page__header">
        <h1>Leaderboard</h1>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() =>
            exportCsv(ranked, 'nika-leaderboard.csv', pricing, overrides)
          }
        >
          Export CSV
        </button>
      </div>

      <LeaderCards rows={ranked} />

      <LeaderboardTable rows={ranked} />
    </div>
  )
}
