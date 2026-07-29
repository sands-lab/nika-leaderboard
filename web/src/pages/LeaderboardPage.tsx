import { useMemo, useState } from 'react'
import { LeaderboardTable } from '../components/LeaderboardTable'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import { exportCsv, withRanks } from '../lib/metrics'

export function LeaderboardPage() {
  const { submissions, filtered, loading, error } = useLeaderboardData()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const ranked = useMemo(() => withRanks(filtered), [filtered])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (ids: string[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  if (loading) return <p className="status">Loading leaderboard…</p>
  if (error) return <p className="status status--error">{error}</p>

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Official Leaderboard</h1>
          <p className="lede">Ranked by mean RCA F1.</p>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => exportCsv(ranked, 'nika-leaderboard.csv')}
        >
          Export CSV
        </button>
      </div>
      <LeaderboardTable
        rows={ranked}
        selected={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
      />
      <p className="muted count-line">
        {ranked.length} of {submissions.length} shown
      </p>
    </div>
  )
}
