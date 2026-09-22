import { useMemo } from 'react'
import { FilterShell } from '../components/FilterShell'
import { LeaderboardTable } from '../components/LeaderboardTable'
import { TopPodium } from '../components/TopPodium'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import { exportCsv, withRanks } from '../lib/metrics'

export function LeaderboardPage() {
  const { filtered, filters, pricing, overrides, loading, error } =
    useLeaderboardData()

  const ranked = useMemo(() => withRanks(filtered), [filtered])

  if (loading) return <p className="status">Loading leaderboard…</p>
  if (error) return <p className="status status--error">{error}</p>

  const scope =
    filters.version === 'all'
      ? 'all releases'
      : `release ${filters.version}`

  return (
    <div className="page">
      <FilterShell />

      <div className="page__header">
        <div>
          <h1>Leaderboard</h1>
          <p className="lede">
            Agents ranked by mean RCA F1 on NIKA network incident diagnosis,{' '}
            {scope}.
          </p>
        </div>
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

      <TopPodium rows={ranked} />

      <LeaderboardTable rows={ranked} />
    </div>
  )
}
