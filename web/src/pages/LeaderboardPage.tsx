import { useMemo } from 'react'
import { FilterShell } from '../components/FilterShell'
import { LeaderboardTable } from '../components/LeaderboardTable'
import { LeaderCards } from '../components/LeaderCards'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import { exportCsv, withRanks } from '../lib/metrics'

export function LeaderboardPage() {
  const { filtered, meta, pricing, overrides, loading, error } =
    useLeaderboardData()

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

      <p className="table-note">
        Ranks are ex aequo: an entry&apos;s rank is 1 + the number of entries
        on the same release whose mean RCA F1 is significantly higher, so
        statistically indistinguishable neighbours share a rank (marked =).
        Significance uses a paired cluster bootstrap over cases (
        {meta?.ranking?.resamples?.toLocaleString('en-US') ?? '10,000'}{' '}
        resamples, {Math.round((meta?.ranking?.confidence ?? 0.95) * 100)}%):
        every entry is rescored on the same resampled cases, and all trials of a
        case are drawn together. The range under each RCA F1 is its{' '}
        {Math.round((meta?.ranking?.confidence ?? 0.95) * 100)}% confidence
        interval. Entries without per-trial results are ranked by point
        estimate and show no interval.
      </p>
    </div>
  )
}
