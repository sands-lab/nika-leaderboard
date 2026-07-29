import { Link } from 'react-router-dom'
import type { SubmissionSummary } from '../lib/types'
import { dash, formatInt, formatPct, formatScore, formatSubmittedAt, primaryLink } from '../lib/data'

interface LeaderboardTableProps {
  rows: SubmissionSummary[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (ids: string[], checked: boolean) => void
}

export function LeaderboardTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
}: LeaderboardTableProps) {
  const allIds = rows.map((r) => r.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onToggleAll(allIds, e.target.checked)}
                aria-label="Select all"
              />
            </th>
            <th>Rank</th>
            <th>System</th>
            <th title="Package identity created_at">Submitted</th>
            <th>Model</th>
            <th>Scaffold</th>
            <th>Provider</th>
            <th>Release</th>
            <th>Split</th>
            <th>RCA F1</th>
            <th>Loc F1</th>
            <th>Detection</th>
            <th>Success</th>
            <th title="Mean tokens per trial (in + out)">Avg tokens</th>
            <th title="Mean steps per trial">Avg steps</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const link = primaryLink(s)
            return (
              <tr key={s.id} className={selected.has(s.id) ? 'is-selected' : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => onToggle(s.id)}
                    aria-label={`Select ${s.name}`}
                  />
                </td>
                <td>{s.rank}</td>
                <td>
                  <div className="system-cell">
                    <strong>{s.name}</strong>
                    <span className="muted">
                      {s.authors}
                      {s.org ? ` · ${s.org}` : ''}
                    </span>
                  </div>
                </td>
                <td className="num" title={s.created_at || undefined}>
                  {formatSubmittedAt(s.created_at)}
                </td>
                <td>{dash(s.model)}</td>
                <td>{dash(s.framework)}</td>
                <td>{dash(s.llm_provider)}</td>
                <td>{s.benchmark_version}</td>
                <td>{dash(s.split)}</td>
                <td className="num">{formatScore(s.mean_rca_f1)}</td>
                <td className="num">{formatScore(s.mean_localization_f1)}</td>
                <td className="num">{formatScore(s.mean_detection_score)}</td>
                <td className="num">{formatPct(s.success_rate)}</td>
                <td className="num">{formatInt(s.mean_tokens)}</td>
                <td className="num">{formatInt(s.mean_steps)}</td>
                <td>
                  <div className="links">
                    {s.github && (
                      <a href={s.github} target="_blank" rel="noreferrer">
                        GitHub
                      </a>
                    )}
                    {s.site && (
                      <a href={s.site} target="_blank" rel="noreferrer">
                        Site
                      </a>
                    )}
                    {s.report && (
                      <a href={s.report} target="_blank" rel="noreferrer">
                        Report
                      </a>
                    )}
                    {!link && <span className="muted">—</span>}
                  </div>
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={16} className="empty-row">
                No submissions match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {selected.size > 0 && (
        <div className="selection-bar">
          <span>{selected.size} selected</span>
          <Link
            className="btn"
            to={`/compare?ids=${encodeURIComponent([...selected].join(','))}`}
          >
            Compare selected
          </Link>
          <Link
            className="btn btn--ghost"
            to={`/matrix?ids=${encodeURIComponent([...selected].join(','))}`}
          >
            Open matrix
          </Link>
        </div>
      )}
    </div>
  )
}
