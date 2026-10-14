import { useMemo } from 'react'
import { FilterShell } from '../components/FilterShell'
import { LeaderboardTable, ScoreKey } from '../components/LeaderboardTable'
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

      {/* The logo and nav already name the page; the heading stays for screen readers. */}
      <h1 className="visually-hidden">Leaderboard</h1>

      <LeaderCards rows={ranked} />

      {/* The score key sits right above the scores it explains. */}
      <div className="table-toolbar">
        <ScoreKey />
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

      <LeaderboardTable rows={ranked} />

    </div>
  )
}
