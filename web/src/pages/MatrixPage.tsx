import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { EChartsOption } from 'echarts'
import { ChartPanel } from '../components/ChartPanel'
import { EntryPicker } from '../components/EntryPicker'
import { SortableTh } from '../components/SortableTh'
import { aggregateByCase } from '../lib/compare'
import { formatPct, formatScore, loadSubmissionDetails } from '../lib/data'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import { compareSortValues, useTableSort } from '../lib/tableSort'
import type { CaseAggregate } from '../lib/compare'
import type { SubmissionDetail } from '../lib/types'

type AggregateMode = 'problem' | 'category' | 'scenario' | 'size'
type MetricMode = 'success' | 'rca'
type MatrixSortKey = 'key' | 'avg' | `col:${number}`

function rowKey(c: CaseAggregate, mode: AggregateMode): string {
  if (mode === 'category') return c.root_cause_category || 'unknown'
  if (mode === 'scenario') return c.scenario
  if (mode === 'size') return c.topo_size || 'null'
  return c.problem
}

export function MatrixPage() {
  const { filtered, loading, error } = useLeaderboardData()
  const [params, setParams] = useSearchParams()
  const [details, setDetails] = useState<SubmissionDetail[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<AggregateMode>('problem')
  const [metric, setMetric] = useState<MetricMode>('success')
  const { sort, toggle } = useTableSort<MatrixSortKey>({
    key: 'avg',
    dir: 'desc',
  })
  const [detailError, setDetailError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (loading || initialized) return
    if (!filtered.length) return
    const valid = new Set(filtered.map((s) => s.id))
    const fromUrl = (params.get('ids') || '')
      .split(',')
      .map((s) => s.trim())
      .filter((id) => valid.has(id))
    const initial =
      fromUrl.length > 0 ? fromUrl : filtered.map((s) => s.id)
    setSelected(initial)
    setInitialized(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filtered, initialized])

  useEffect(() => {
    if (!initialized) return
    const valid = new Set(filtered.map((s) => s.id))
    const next = selected.filter((id) => valid.has(id))
    if (next.length !== selected.length) {
      const paramsNext = new URLSearchParams(params)
      if (next.length) paramsNext.set('ids', next.join(','))
      else paramsNext.delete('ids')
      setParams(paramsNext, { replace: true })
      setSelected(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, initialized])

  useEffect(() => {
    let cancelled = false
    if (!selected.length) {
      setDetails([])
      return
    }
    ;(async () => {
      try {
        const loaded = await loadSubmissionDetails(selected)
        if (!cancelled) {
          setDetails(loaded)
          setDetailError(null)
        }
      } catch (e) {
        if (!cancelled) setDetailError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected])

  const syncUrl = (ids: string[]) => {
    setSelected(ids)
    const next = new URLSearchParams(params)
    if (ids.length) next.set('ids', ids.join(','))
    else next.delete('ids')
    setParams(next, { replace: true })
  }

  const matrix = useMemo(() => {
    const perEntry = details.map((d) => {
      const cases = aggregateByCase(d.trials)
      const buckets = new Map<string, { sum: number; n: number }>()
      for (const c of cases) {
        const key = rowKey(c, mode)
        const value = metric === 'success' ? c.success_rate : c.mean_rca_f1
        const cur = buckets.get(key) || { sum: 0, n: 0 }
        cur.sum += value
        cur.n += 1
        buckets.set(key, cur)
      }
      const means = new Map<string, number>()
      for (const [k, v] of buckets) means.set(k, v.sum / v.n)
      return means
    })

    const keys = new Set<string>()
    for (const m of perEntry) for (const k of m.keys()) keys.add(k)

    const rows = [...keys].map((key) => {
      const values = perEntry.map((m) => m.get(key) ?? null)
      const present = values.filter((v): v is number => v != null)
      const avg =
        present.length > 0
          ? present.reduce((a, b) => a + b, 0) / present.length
          : 0
      return { key, values, avg }
    })

    rows.sort((a, b) => {
      if (sort.key === 'key') return compareSortValues(a.key, b.key, sort.dir)
      if (sort.key === 'avg') return compareSortValues(a.avg, b.avg, sort.dir)
      if (sort.key.startsWith('col:')) {
        const i = Number(sort.key.slice(4))
        return compareSortValues(a.values[i], b.values[i], sort.dir)
      }
      return 0
    })

    return rows
  }, [details, mode, metric, sort])

  const heatOption = useMemo((): EChartsOption => {
    const yLabels = matrix.map((r) => r.key)
    const xLabels = details.map((d) => d.name)
    const data: Array<[number, number, number]> = []
    matrix.forEach((row, yi) => {
      row.values.forEach((v, xi) => {
        if (v != null) data.push([xi, yi, Number(v.toFixed(4))])
      })
    })
    return {
      tooltip: {
        formatter: (p: unknown) => {
          const item = p as { value: number[] }
          return `${xLabels[item.value[0]]}<br/>${yLabels[item.value[1]]}<br/>${(
            item.value[2] * 100
          ).toFixed(1)}%`
        },
      },
      grid: { left: 160, right: 96, top: 28, bottom: 120 },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLabel: {
          rotate: 28,
          interval: 0,
          hideOverlap: true,
          fontSize: 11,
          margin: 14,
        },
      },
      yAxis: { type: 'category', data: yLabels },
      visualMap: {
        min: 0,
        max: 1,
        calculable: true,
        orient: 'vertical',
        right: 8,
        top: 'middle',
        itemHeight: 140,
        text: ['High', 'Low'],
        textGap: 8,
        inRange: { color: ['#ecfeff', '#0e7490'] },
      },
      series: [
        {
          type: 'heatmap',
          data,
          label: {
            show: matrix.length <= 40,
            formatter: (p: unknown) => {
              const item = p as { value: number[] }
              return `${Math.round(item.value[2] * 100)}`
            },
          },
        },
      ],
    }
  }, [matrix, details])

  if (loading) return <p className="status">Loading matrix…</p>
  if (error || detailError) {
    return (
      <p className="status status--error">{error || detailError}</p>
    )
  }

  const toggleId = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id]
    syncUrl(next)
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Case Matrix</h1>
          <p className="lede">
            Solve rate or RCA F1 by problem, category, scenario, or size. Click
            column headers to sort.
          </p>
        </div>
        <Link className="btn btn--ghost" to="/">
          Back to leaderboard
        </Link>
      </div>

      <EntryPicker
        selected={selected}
        onToggle={toggleId}
        onSetSelected={syncUrl}
        subtitle={(s) => s.model || '—'}
      />

      <div className="toolbar">
        <label>
          Aggregate
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as AggregateMode)}
          >
            <option value="problem">Problem / failure</option>
            <option value="category">Failure category</option>
            <option value="scenario">Scenario</option>
            <option value="size">Topo size</option>
          </select>
        </label>
        <label>
          Metric
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricMode)}
          >
            <option value="success">Success %</option>
            <option value="rca">Mean RCA F1</option>
          </select>
        </label>
      </div>

      <ChartPanel
        title="Heatmap"
        option={heatOption}
        filename="nika-matrix"
        height={Math.min(760, 120 + matrix.length * 22)}
        empty={!details.length || !matrix.length}
        zoomSlider={false}
      />

      <div className="table-wrap">
        <table className="data-table matrix-table">
          <thead>
            <tr>
              <SortableTh
                label={mode}
                sortKey="key"
                sort={sort}
                onSort={toggle}
              />
              {details.map((d, i) => (
                <SortableTh
                  key={d.id}
                  label={d.name}
                  sortKey={`col:${i}`}
                  sort={sort}
                  onSort={toggle}
                />
              ))}
              <SortableTh label="Avg" sortKey="avg" sort={sort} onSort={toggle} />
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.key}>
                <td>{row.key}</td>
                {row.values.map((v, i) => (
                  <td
                    key={`${row.key}-${i}`}
                    className="num"
                    style={{
                      background:
                        v == null
                          ? undefined
                          : `rgba(14, 116, 144, ${0.12 + v * 0.55})`,
                    }}
                  >
                    {v == null
                      ? '—'
                      : metric === 'success'
                        ? formatPct(v)
                        : formatScore(v)}
                  </td>
                ))}
                <td className="num">
                  {metric === 'success'
                    ? formatPct(row.avg)
                    : formatScore(row.avg)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
