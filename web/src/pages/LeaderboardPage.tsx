import { useEffect, useMemo, useState } from 'react'
import { LeaderboardTable } from '../components/LeaderboardTable'
import { formatScore, loadCatalog } from '../lib/data'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import { exportCsv, withRanks } from '../lib/metrics'

interface CatalogOverview {
  cases: number
  scenarios: number
  categories: number
}

function uniqueCount(
  rows: Array<string | null | undefined>,
): number {
  return new Set(rows.filter((v): v is string => Boolean(v))).size
}

export function LeaderboardPage() {
  const { submissions, filtered, filters, meta, loading, error } =
    useLeaderboardData()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [catalogOverview, setCatalogOverview] =
    useState<CatalogOverview | null>(null)

  const ranked = useMemo(() => withRanks(filtered), [filtered])

  const overview = useMemo(() => {
    const fromSubmissions = Math.max(
      0,
      ...filtered.map((s) => s.case_count ?? 0),
    )
    const rcaScores = filtered
      .map((s) => s.mean_rca_f1)
      .filter((v): v is number => v != null && !Number.isNaN(v))
    const topRca = rcaScores.length ? Math.max(...rcaScores) : null
    return {
      totalCases: catalogOverview?.cases ?? fromSubmissions,
      evaluations: filtered.length,
      scaffolds: uniqueCount(filtered.map((s) => s.framework)),
      models: uniqueCount(filtered.map((s) => s.model)),
      scenarios: catalogOverview?.scenarios ?? null,
      categories: catalogOverview?.categories ?? null,
      topRca,
    }
  }, [filtered, catalogOverview])

  useEffect(() => {
    let cancelled = false
    const version =
      filters.version !== 'all'
        ? filters.version
        : meta?.versions.length === 1
          ? meta.versions[0]
          : null
    if (!version) {
      setCatalogOverview(null)
      return
    }
    ;(async () => {
      try {
        const catalog = await loadCatalog(version)
        if (cancelled) return
        const cases =
          filters.split === 'all'
            ? catalog.cases
            : catalog.cases.filter((c) => c.split === filters.split)
        const scenarios = new Set(cases.map((c) => c.scenario))
        const categories = new Set(
          cases
            .map((c) => c.root_cause_category)
            .filter((v): v is string => Boolean(v)),
        )
        setCatalogOverview({
          cases: cases.length,
          scenarios: scenarios.size,
          categories: categories.size,
        })
      } catch {
        if (!cancelled) setCatalogOverview(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filters.version, filters.split, meta])

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
          <h1>Leaderboard</h1>
          <p className="lede">
            NIKA evaluates agents on network incident diagnosis — detection,
            localization, and root-cause analysis (RCA). Entries are ranked by
            mean RCA F1.
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

      <section className="overview-stats" aria-label="Leaderboard overview">
        <div className="overview-stat">
          <strong className="overview-stat__value">
            {overview.totalCases.toLocaleString()}
          </strong>
          <span className="overview-stat__label">Total Cases</span>
        </div>
        <div className="overview-stat">
          <strong className="overview-stat__value">
            {overview.evaluations.toLocaleString()}
          </strong>
          <span className="overview-stat__label">Evaluations</span>
        </div>
        <div className="overview-stat">
          <strong className="overview-stat__value">
            {overview.scaffolds.toLocaleString()}
          </strong>
          <span className="overview-stat__label">Scaffolds</span>
        </div>
        <div className="overview-stat">
          <strong className="overview-stat__value">
            {overview.models.toLocaleString()}
          </strong>
          <span className="overview-stat__label">Models</span>
        </div>
        {overview.scenarios != null && (
          <div className="overview-stat">
            <strong className="overview-stat__value">
              {overview.scenarios.toLocaleString()}
            </strong>
            <span className="overview-stat__label">Scenarios</span>
          </div>
        )}
        {overview.categories != null && (
          <div className="overview-stat">
            <strong className="overview-stat__value">
              {overview.categories.toLocaleString()}
            </strong>
            <span className="overview-stat__label">Failure Categories</span>
          </div>
        )}
        {overview.topRca != null && (
          <div className="overview-stat">
            <strong className="overview-stat__value">
              {formatScore(overview.topRca)}
            </strong>
            <span className="overview-stat__label">Top RCA F1</span>
          </div>
        )}
      </section>

      <LeaderboardTable
        rows={ranked}
        selected={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
      />
      <p className="muted count-line">
        {ranked.length} of {submissions.length} shown
      </p>

      <section className="metrics-legend" aria-labelledby="metrics-legend-heading">
        <h2 id="metrics-legend-heading">How scores are computed</h2>
        <p className="lede">
          Each trial is scored against ground truth for detection, localization,
          and RCA. Leaderboard columns are means over the expected trial count;
          failed or missing trials contribute 0.
        </p>
        <dl className="metrics-legend__list">
          <div className="metrics-legend__item">
            <dt>Detection</dt>
            <dd>
              Binary match on anomaly flag:{' '}
              <code>1</code> if{' '}
              <code>is_anomaly</code> equals ground truth, else <code>0</code>.
              Column = mean of per-trial detection scores.
            </dd>
          </div>
          <div className="metrics-legend__item">
            <dt>Loc F1</dt>
            <dd>
              Set F1 over predicted vs. true faulty devices:{' '}
              <code>
                F1 = 2 · P · R / (P + R)
              </code>
              , where precision/recall use set TP/FP/FN on device names. Column =
              mean localization F1.
            </dd>
          </div>
          <div className="metrics-legend__item">
            <dt>RCA F1</dt>
            <dd>
              Set F1 over predicted vs. true root-cause names (same formula as
              Loc F1). Primary ranking metric; column = mean RCA F1.
            </dd>
          </div>
          <div className="metrics-legend__item">
            <dt>Success</dt>
            <dd>
              Share of trials that finished with a valid agent submission:{' '}
              <code>n_success / n_trials_expected</code>. Does not require a
              perfect score — only that the trial outcome is{' '}
              <code>success</code> rather than <code>agent_failed</code>.
            </dd>
          </div>
          <div className="metrics-legend__item">
            <dt>Means</dt>
            <dd>
              For Detection / Loc F1 / RCA F1:{' '}
              <code>
                mean = Σ score(trial) / n_trials_expected
              </code>
              . Invalid scores (&lt; 0) and non-success outcomes are treated as{' '}
              <code>0</code>; missing expected trials also count as <code>0</code>.
            </dd>
          </div>
          <div className="metrics-legend__item">
            <dt>Avg tokens / steps</dt>
            <dd>
              <code>(total in + out tokens) / n_trials_expected</code> and{' '}
              <code>total steps / n_trials_expected</code>.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
