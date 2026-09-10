import { useMemo } from 'react'
import { LeaderboardTable } from '../components/LeaderboardTable'
import { TopPodium } from '../components/TopPodium'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import { exportCsv, withRanks } from '../lib/metrics'

export function LeaderboardPage() {
  const { filtered, loading, error } = useLeaderboardData()

  const ranked = useMemo(() => withRanks(filtered), [filtered])

  if (loading) return <p className="status">Loading leaderboard…</p>
  if (error) return <p className="status status--error">{error}</p>

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Leaderboard</h1>
          <p className="lede">
            Agents ranked by mean RCA F1 on NIKA network incident diagnosis.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => exportCsv(ranked, 'nika-leaderboard.csv')}
        >
          Export CSV
        </button>
      </div>

      <TopPodium rows={ranked} />

      <LeaderboardTable rows={ranked} />
    </div>
  )
}
