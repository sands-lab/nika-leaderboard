import { useMemo } from 'react'
import { SortableTh } from './SortableTh'
import type { SubmissionSummary } from '../lib/types'
import {
  dash,
  formatDateUtc,
  formatCount,
  formatPct,
  formatScore,
  primaryLink,
} from '../lib/data'
import {
  adaptationMethods,
  formatAdaptation,
  scaffoldTags,
} from '../lib/metrics'
import { modelReleaseDate } from '../lib/modelMeta'
import {
  providerDisplayName,
  providerIconSrc,
  resolveProvider,
} from '../lib/providerMeta'
import { sortByAccessors, useTableSort } from '../lib/tableSort'

interface LeaderboardTableProps {
  rows: SubmissionSummary[]
}

type LbSortKey =
  | 'rank'
  | 'model'
  | 'model_release'
  | 'scaffold'
  | 'adaptation'
  | 'provider'
  | 'rca'
  | 'loc'
  | 'detection'
  | 'success'
  | 'avg_tokens'
  | 'avg_steps'
  | 'submitted'

function ScorePill({ value }: { value: number | null | undefined }) {
  if (value == null || Number.isNaN(value)) {
    return <span className="num">—</span>
  }
  const t = Math.max(0, Math.min(1, value))
  return (
    <span
      className="score-pill"
      style={{
        background: `rgba(0, 212, 255, ${0.1 + t * 0.32})`,
        boxShadow: `inset 0 0 0 1px rgba(0, 212, 255, ${0.12 + t * 0.28})`,
      }}
    >
      {formatScore(value)}
    </span>
  )
}

function ProviderIcon({
  llmProvider,
  model,
}: {
  llmProvider: string | null | undefined
  model: string | null | undefined
}) {
  const provider = resolveProvider(llmProvider, model)
  if (!provider) return <span className="muted">—</span>
  const src = providerIconSrc(provider)
  const label = providerDisplayName(provider)
  if (!src) {
    return (
      <span className="provider-fallback" title={label}>
        {label}
      </span>
    )
  }
  return (
    <span className="provider-icon" title={label}>
      <img src={src} alt={label} width={18} height={18} loading="lazy" />
      <span className="visually-hidden">{label}</span>
    </span>
  )
}

function ScaffoldCell({ s }: { s: SubmissionSummary }) {
  const tags = scaffoldTags(s)
  return (
    <div className="scaffold-cell">
      <span className="scaffold-cell__name">{dash(s.framework)}</span>
      {tags.length > 0 && (
        <span className="scaffold-cell__tags">
          {tags.map((tag) => (
            <span key={tag} className="scaffold-tag">
              {tag}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

const ACCESSORS: Record<LbSortKey, (s: SubmissionSummary) => unknown> = {
  rank: (s) => s.rank ?? 0,
  model: (s) => s.model,
  model_release: (s) => modelReleaseDate(s.model)?.getTime() ?? null,
  scaffold: (s) => s.framework,
  adaptation: (s) => formatAdaptation(s),
  provider: (s) => resolveProvider(s.llm_provider, s.model),
  rca: (s) => s.mean_rca_f1,
  loc: (s) => s.mean_localization_f1,
  detection: (s) => s.mean_detection_score,
  success: (s) => s.success_rate,
  avg_tokens: (s) => s.mean_tokens,
  avg_steps: (s) => s.mean_steps,
  submitted: (s) => s.created_at,
}

export function LeaderboardTable({ rows }: LeaderboardTableProps) {
  const { sort, toggle } = useTableSort<LbSortKey>({
    key: 'rank',
    dir: 'asc',
  })
  const sorted = useMemo(
    () => sortByAccessors(rows, sort, ACCESSORS),
    [rows, sort],
  )

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <SortableTh label="Rank" sortKey="rank" sort={sort} onSort={toggle} />
            <SortableTh
              label="Model"
              sortKey="model"
              sort={sort}
              onSort={toggle}
              className="model-th"
            />
            <SortableTh
              label="Model release"
              sortKey="model_release"
              sort={sort}
              onSort={toggle}
              title="Approximate public model release date"
              className="col-secondary"
            />
            <SortableTh
              label="Scaffold"
              sortKey="scaffold"
              sort={sort}
              onSort={toggle}
              className="col-narrow-hide"
            />
            <SortableTh
              label="Adaptation"
              sortKey="adaptation"
              sort={sort}
              onSort={toggle}
              title="Pre-benchmark optimization / training (e.g. None, GEPA, SFT, RL)"
              className="col-narrow-hide"
            />
            <SortableTh
              label="Provider"
              sortKey="provider"
              sort={sort}
              onSort={toggle}
              title="LLM provider"
              className="col-secondary"
            />
            <SortableTh
              label="Detection"
              sortKey="detection"
              sort={sort}
              onSort={toggle}
              className="col-secondary"
            />
            <SortableTh
              label="Loc F1"
              sortKey="loc"
              sort={sort}
              onSort={toggle}
              className="col-secondary"
            />
            <SortableTh label="RCA F1" sortKey="rca" sort={sort} onSort={toggle} />
            <SortableTh
              label="Success"
              sortKey="success"
              sort={sort}
              onSort={toggle}
              className="col-secondary"
            />
            <SortableTh
              label="Avg tokens"
              sortKey="avg_tokens"
              sort={sort}
              onSort={toggle}
              title="Mean tokens per trial (in + out)"
              className="col-secondary"
            />
            <SortableTh
              label="Avg steps"
              sortKey="avg_steps"
              sort={sort}
              onSort={toggle}
              title="Mean steps per trial"
              className="col-secondary"
            />
            <SortableTh
              label="Submitted"
              sortKey="submitted"
              sort={sort}
              onSort={toggle}
              title="Package identity created_at (UTC date)"
              className="col-secondary"
            />
            <th className="col-secondary">Links</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const link = primaryLink(s)
            const release = modelReleaseDate(s.model)
            const adapted = adaptationMethods(s)
            return (
              <tr key={s.id}>
                <td>{s.rank}</td>
                <td className="model-td">
                  <strong className="model-name" title={s.name}>
                    {dash(s.model)}
                  </strong>
                </td>
                <td className="num col-secondary">{formatDateUtc(release)}</td>
                <td className="col-narrow-hide">
                  <ScaffoldCell s={s} />
                </td>
                <td
                  className={`col-narrow-hide adaptation-td${adapted.length === 0 ? ' adaptation-td--none' : ''}`}
                >
                  {formatAdaptation(s)}
                </td>
                <td className="col-secondary">
                  <ProviderIcon llmProvider={s.llm_provider} model={s.model} />
                </td>
                <td className="num col-secondary">
                  <ScorePill value={s.mean_detection_score} />
                </td>
                <td className="num col-secondary">
                  <ScorePill value={s.mean_localization_f1} />
                </td>
                <td className="num">
                  <ScorePill value={s.mean_rca_f1} />
                </td>
                <td className="num col-secondary">
                  {formatPct(s.success_rate)}
                </td>
                <td className="num col-secondary">
                  {formatCount(s.mean_tokens)}
                </td>
                <td className="num col-secondary">
                  {formatCount(s.mean_steps)}
                </td>
                <td
                  className="num col-secondary"
                  title={s.created_at || undefined}
                >
                  {formatDateUtc(s.created_at)}
                </td>
                <td className="col-secondary">
                  <div className="links">
                    {s.github && (
                      <a href={s.github} target="_blank" rel="noreferrer">
                        GitHub
                      </a>
                    )}
                    {s.trajectories_url && (
                      <a
                        href={s.trajectories_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Trajectories
                      </a>
                    )}
                    {s.site && (
                      <a href={s.site} target="_blank" rel="noreferrer">
                        Site
                      </a>
                    )}
                    {s.report && (
                      <a
                        href={s.report}
                        target="_blank"
                        rel="noreferrer"
                        title={s.report}
                      >
                        arXiv
                      </a>
                    )}
                    {!link && !s.trajectories_url && (
                      <span className="muted">—</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={14} className="empty-row">
                No submissions match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
