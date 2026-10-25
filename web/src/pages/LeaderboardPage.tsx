import { useMemo, type CSSProperties } from 'react'
import { ColumnPicker } from '../components/ColumnPicker'
import { FilterShell } from '../components/FilterShell'
import { LeaderboardTable, ScoreKey } from '../components/LeaderboardTable'
import { LeaderCards } from '../components/LeaderCards'
import { PriceModeToggle } from '../components/PriceModeToggle'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import { exportCsv, withRanks } from '../lib/metrics'
import { useOptionalColumns } from '../lib/optionalColumns'

export function LeaderboardPage() {
  const { filtered, pricing, overrides, priceMode, loading, error } =
    useLeaderboardData()
  const columns = useOptionalColumns()

  const ranked = useMemo(() => withRanks(filtered), [filtered])
  // Each optional column widens the board's cap, so it never forces a scroll.
  const boardStyle = {
    '--lb-extra-cols': Object.values(columns.visible).filter(Boolean).length,
  } as CSSProperties

  if (loading) return <p className="status">Loading leaderboard…</p>
  if (error) return <p className="status status--error">{error}</p>

  return (
    <div className="page">
      <FilterShell />

      {/* The logo and nav already name the page; the heading stays for screen readers. */}
      <h1 className="visually-hidden">Leaderboard</h1>

      <LeaderCards rows={ranked} />

      <div className="leaderboard-board" style={boardStyle}>
        {/* The score key sits right above the scores it explains. */}
        <div className="table-toolbar">
          <ScoreKey />
          <PriceModeToggle />
          <ColumnPicker visible={columns.visible} onToggle={columns.toggle} />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() =>
              exportCsv(ranked, 'nika-leaderboard.csv', pricing, overrides, priceMode)
            }
          >
            Export CSV
          </button>
        </div>

        <LeaderboardTable rows={ranked} columns={columns.visible} />
      </div>

    </div>
  )
}
