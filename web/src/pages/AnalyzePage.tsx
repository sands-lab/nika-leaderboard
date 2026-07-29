import { useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { ChartPanel } from '../components/ChartPanel'
import { SortableTh } from '../components/SortableTh'
import { formatPct, formatScore } from '../lib/data'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import { modelReleaseDate } from '../lib/modelMeta'
import { sortByAccessors, useTableSort } from '../lib/tableSort'
import type { SubmissionSummary } from '../lib/types'

type ResolvedMetric = 'success' | 'rca'
type AnalyzeSortKey =
  | 'name'
  | 'release'
  | 'split'
  | 'model'
  | 'rca'
  | 'success'
  | 'avg_tokens'
  | 'total_tokens'
  | 'max_steps'
  | 'timeout'

const ANALYZE_ACCESSORS: Record<
  AnalyzeSortKey,
  (s: SubmissionSummary) => unknown
> = {
  name: (s) => s.name,
  release: (s) => s.benchmark_version,
  split: (s) => s.split,
  model: (s) => s.model,
  rca: (s) => s.mean_rca_f1,
  success: (s) => s.success_rate,
  avg_tokens: (s) => s.mean_tokens,
  total_tokens: (s) => s.total_tokens,
  max_steps: (s) => s.max_steps,
  timeout: (s) => s.case_timeout_sec,
}

const COLORS = ['#0e7490', '#ea580c', '#1d4ed8', '#7c3aed', '#ca8a04', '#be123c']

function resolvedValue(s: SubmissionSummary, metric: ResolvedMetric): number {
  return metric === 'success' ? s.success_rate ?? 0 : s.mean_rca_f1 ?? 0
}

function resolvedLabel(metric: ResolvedMetric): string {
  return metric === 'success' ? 'Success %' : 'Mean RCA F1'
}

function scatterOption(args: {
  points: Array<{
    name: string
    x: number
    y: number
    color: string
  }>
  xName: string
  yName: string
  xIsDate?: boolean
  yMax?: number
  yAsPercent?: boolean
}): EChartsOption {
  const { points, xName, yName, xIsDate, yMax, yAsPercent } = args
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xPad = xIsDate
    ? paddedExtent(xs, 0.2, 5 * 24 * 60 * 60 * 1000)
    : paddedExtent(xs, 0.1, 0)
  // Keep scores in [0, yMax] but leave headroom so markers/labels stay inside.
  const yHi = yMax ?? 1
  const yDataMax = ys.length ? Math.max(...ys) : 0
  const yAxisMax = Math.min(yHi * 1.05, Math.max(yHi, yDataMax * 1.08))

  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: unknown) => {
        const item = p as {
          data: { name: string; value: number[]; xLabel?: string }
        }
        const xVal =
          item.data.xLabel ?? Number(item.data.value[0]).toLocaleString()
        const yVal = item.data.value[1]
        const yText = yAsPercent
          ? `${(yVal * 100).toFixed(1)}%`
          : yVal.toFixed(3)
        return `${item.data.name}<br/>${xName}: ${xVal}<br/>${yName}: ${yText}`
      },
    },
    grid: { left: 64, right: 48, top: 36, bottom: 64, containLabel: true },
    xAxis: xIsDate
      ? {
          type: 'time',
          name: xName,
          nameLocation: 'middle',
          nameGap: 36,
          min: xPad.min,
          max: xPad.max,
        }
      : {
          type: 'value',
          name: xName,
          nameLocation: 'middle',
          nameGap: 36,
          min: xPad.min,
          max: xPad.max,
          scale: true,
        },
    yAxis: {
      type: 'value',
      name: yName,
      nameLocation: 'middle',
      nameGap: 48,
      min: 0,
      max: yAxisMax,
      axisLabel: {
        formatter: (v: number) =>
          yAsPercent ? `${Math.round(v * 100)}%` : v.toFixed(2),
      },
    },
    series: [
      {
        type: 'scatter',
        symbolSize: 16,
        data: points.map((pt) => ({
          name: pt.name,
          value: [pt.x, pt.y],
          xLabel: xIsDate
            ? new Date(pt.x).toISOString().slice(0, 10)
            : undefined,
          itemStyle: { color: pt.color },
          label: {
            show: points.length <= 20,
            formatter: pt.name,
            position: 'top',
            distance: 8,
            fontSize: 11,
            color: '#334155',
          },
        })),
      },
    ],
  }
}

function paddedExtent(
  values: number[],
  padRatio = 0.1,
  minPad = 0,
): { min: number; max: number } {
  if (!values.length) return { min: 0, max: 1 }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  if (lo === hi) {
    const pad = Math.max(Math.abs(lo) * padRatio, minPad || Math.abs(lo) * 0.05 || 1)
    return { min: lo - pad, max: hi + pad }
  }
  const pad = Math.max((hi - lo) * padRatio, minPad)
  return { min: lo - pad, max: hi + pad }
}

export function AnalyzePage() {
  const { filtered, loading, error } = useLeaderboardData()
  const [resolvedMetric, setResolvedMetric] = useState<ResolvedMetric>('success')
  const { sort, toggle } = useTableSort<AnalyzeSortKey>({
    key: 'rca',
    dir: 'desc',
  })

  const scoped = filtered
  const sortedRows = useMemo(
    () => sortByAccessors(scoped, sort, ANALYZE_ACCESSORS),
    [scoped, sort],
  )
  const versions = useMemo(
    () => [...new Set(scoped.map((r) => r.benchmark_version))].sort(),
    [scoped],
  )

  const colored = useMemo(
    () =>
      scoped.map((s, i) => ({
        s,
        color: COLORS[i % COLORS.length],
      })),
    [scoped],
  )

  const yName = resolvedLabel(resolvedMetric)
  const yAsPercent = resolvedMetric === 'success'
  const yMax = 1

  const vsCost = useMemo((): EChartsOption => {
    const points = colored
      .filter(({ s }) => (s.total_tokens ?? 0) > 0)
      .map(({ s, color }) => ({
        name: s.name,
        x: s.total_tokens ?? 0,
        y: resolvedValue(s, resolvedMetric),
        color,
      }))
    return scatterOption({
      points,
      xName: 'Total tokens',
      yName,
      yMax,
      yAsPercent,
    })
  }, [colored, resolvedMetric, yName, yAsPercent])

  const vsReleaseDate = useMemo((): EChartsOption => {
    const raw = colored
      .map(({ s, color }) => {
        const d = modelReleaseDate(s.model)
        if (!d) return null
        return {
          name: s.name,
          x: d.getTime(),
          y: resolvedValue(s, resolvedMetric),
          color,
        }
      })
      .filter((p): p is NonNullable<typeof p> => p != null)
    // Nudge coincident release dates so markers/labels don't stack on the edge.
    const byX = new Map<number, number>()
    const points = raw.map((p) => {
      const n = byX.get(p.x) || 0
      byX.set(p.x, n + 1)
      const day = 24 * 60 * 60 * 1000
      return { ...p, x: p.x + n * day * 0.35 }
    })
    return scatterOption({
      points,
      xName: 'Model release date',
      yName,
      yMax,
      xIsDate: true,
      yAsPercent,
    })
  }, [colored, resolvedMetric, yName, yAsPercent])

  const vsAvgCost = useMemo((): EChartsOption => {
    const points = colored
      .filter(({ s }) => (s.mean_tokens ?? 0) > 0)
      .map(({ s, color }) => ({
        name: s.name,
        x: s.mean_tokens ?? 0,
        y: resolvedValue(s, resolvedMetric),
        color,
      }))
    return scatterOption({
      points,
      xName: 'Avg tokens / trial',
      yName,
      yMax,
      yAsPercent,
    })
  }, [colored, resolvedMetric, yName, yAsPercent])

  const vsCostLimit = useMemo((): EChartsOption => {
    const points = colored
      .filter(({ s }) => s.case_timeout_sec != null && s.case_timeout_sec > 0)
      .map(({ s, color }) => ({
        name: s.name,
        x: s.case_timeout_sec ?? 0,
        y: resolvedValue(s, resolvedMetric),
        color,
      }))
    return scatterOption({
      points,
      xName: 'Case timeout (s)',
      yName,
      yMax,
      yAsPercent,
    })
  }, [colored, resolvedMetric, yName, yAsPercent])

  const vsStepLimit = useMemo((): EChartsOption => {
    const points = colored
      .filter(({ s }) => s.max_steps != null && s.max_steps > 0)
      .map(({ s, color }) => ({
        name: s.name,
        x: s.max_steps ?? 0,
        y: resolvedValue(s, resolvedMetric),
        color,
      }))
    return scatterOption({
      points,
      xName: 'Step limit (max_steps)',
      yName,
      yMax,
      yAsPercent,
    })
  }, [colored, resolvedMetric, yName, yAsPercent])

  const byVersionOption = useMemo((): EChartsOption => {
    const groups = new Map<string, number[]>()
    for (const r of scoped) {
      const list = groups.get(r.benchmark_version) || []
      list.push(r.mean_rca_f1 ?? 0)
      groups.set(r.benchmark_version, list)
    }
    const labels = [...groups.keys()].sort()
    return {
      tooltip: {},
      xAxis: { type: 'category', data: labels, name: 'Release' },
      yAxis: { type: 'value', name: 'Mean RCA F1', min: 0, max: 1 },
      series: [
        {
          type: 'bar',
          data: labels.map((v) => {
            const vals = groups.get(v) || []
            return vals.reduce((a, b) => a + b, 0) / (vals.length || 1)
          }),
          itemStyle: { color: '#0e7490' },
        },
      ],
    }
  }, [scoped])

  const systemAcrossVersions = useMemo((): EChartsOption => {
    const byName = new Map<string, Map<string, number>>()
    for (const r of scoped) {
      const stem = (r.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || r.name
      const m = byName.get(stem) || new Map<string, number>()
      const prev = m.get(r.benchmark_version)
      const score = r.mean_rca_f1 ?? 0
      m.set(r.benchmark_version, prev == null ? score : Math.max(prev, score))
      byName.set(stem, m)
    }
    const systems = [...byName.keys()].sort()
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: versions, bottom: 0 },
      xAxis: { type: 'category', data: systems, axisLabel: { rotate: 20 } },
      yAxis: { type: 'value', min: 0, max: 1, name: 'RCA F1' },
      series: versions.map((ver, i) => ({
        name: ver,
        type: 'bar',
        data: systems.map((s) => byName.get(s)?.get(ver) ?? null),
        itemStyle: {
          color: ['#0e7490', '#ea580c', '#1d4ed8'][i % 3],
        },
      })),
    }
  }, [scoped, versions])

  const hasStepLimit = colored.some(
    ({ s }) => s.max_steps != null && s.max_steps > 0,
  )
  const hasTimeout = colored.some(
    ({ s }) => s.case_timeout_sec != null && s.case_timeout_sec > 0,
  )
  const hasReleaseDates = colored.some(({ s }) => modelReleaseDate(s.model))

  if (loading) return <p className="status">Loading analyze view…</p>
  if (error) return <p className="status status--error">{error}</p>

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Score Trends</h1>
          <p className="lede">Resolved rate against tokens and run limits.</p>
        </div>
        <div className="analyze-controls">
          <label className="filter">
            <span>Y-axis</span>
            <select
              value={resolvedMetric}
              onChange={(e) =>
                setResolvedMetric(e.target.value as ResolvedMetric)
              }
            >
              <option value="success">Success %</option>
              <option value="rca">Mean RCA F1</option>
            </select>
          </label>
        </div>
      </div>

      <h2 className="section-title">Scatters</h2>

      <div className="chart-grid chart-grid--stack">
        <ChartPanel
          title={`${yName} vs total tokens`}
          option={vsCost}
          filename="nika-resolved-vs-cost"
          empty={!scoped.length}
          height={520}
        />
        <ChartPanel
          title={`${yName} vs model release date`}
          option={vsReleaseDate}
          filename="nika-resolved-vs-release-date"
          empty={!hasReleaseDates}
          emptyMessage="No known model release dates for the current entries."
          height={520}
        />
        <ChartPanel
          title={`${yName} vs avg tokens / trial`}
          option={vsAvgCost}
          filename="nika-resolved-vs-avg-cost"
          empty={!scoped.length}
          height={520}
        />
        <ChartPanel
          title={`${yName} vs case timeout`}
          option={vsCostLimit}
          filename="nika-resolved-vs-timeout"
          empty={!hasTimeout}
          emptyMessage="No case_timeout_sec on current submissions."
          height={520}
        />
        <ChartPanel
          title={`${yName} vs step limit`}
          option={vsStepLimit}
          filename="nika-resolved-vs-step-limit"
          empty={!hasStepLimit}
          emptyMessage="No max_steps set on current submissions."
          height={520}
        />
      </div>

      <h2 className="section-title">Across releases</h2>
      <div className="chart-grid chart-grid--stack">
        <ChartPanel
          title="Average RCA F1 by release"
          option={byVersionOption}
          filename="nika-by-version"
          empty={!scoped.length}
          height={480}
        />
        <ChartPanel
          title="System family across releases"
          option={systemAcrossVersions}
          filename="nika-system-versions"
          empty={!scoped.length}
          height={480}
        />
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Name" sortKey="name" sort={sort} onSort={toggle} />
              <SortableTh
                label="Release"
                sortKey="release"
                sort={sort}
                onSort={toggle}
              />
              <SortableTh label="Split" sortKey="split" sort={sort} onSort={toggle} />
              <SortableTh label="Model" sortKey="model" sort={sort} onSort={toggle} />
              <SortableTh label="RCA F1" sortKey="rca" sort={sort} onSort={toggle} />
              <SortableTh
                label="Success"
                sortKey="success"
                sort={sort}
                onSort={toggle}
              />
              <SortableTh
                label="Avg tokens"
                sortKey="avg_tokens"
                sort={sort}
                onSort={toggle}
              />
              <SortableTh
                label="Total tokens"
                sortKey="total_tokens"
                sort={sort}
                onSort={toggle}
              />
              <SortableTh
                label="Max steps"
                sortKey="max_steps"
                sort={sort}
                onSort={toggle}
              />
              <SortableTh
                label="Timeout"
                sortKey="timeout"
                sort={sort}
                onSort={toggle}
              />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.benchmark_version}</td>
                <td>{s.split}</td>
                <td>{s.model}</td>
                <td className="num">{formatScore(s.mean_rca_f1)}</td>
                <td className="num">{formatPct(s.success_rate)}</td>
                <td className="num">
                  {s.mean_tokens == null ? '—' : Math.round(s.mean_tokens).toLocaleString()}
                </td>
                <td className="num">
                  {s.total_tokens == null
                    ? '—'
                    : s.total_tokens.toLocaleString()}
                </td>
                <td className="num">{s.max_steps ?? '—'}</td>
                <td className="num">{s.case_timeout_sec ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
