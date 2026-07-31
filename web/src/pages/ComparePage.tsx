import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { EChartsOption } from 'echarts'
import { ChartPanel } from '../components/ChartPanel'
import { EntryPicker } from '../components/EntryPicker'
import { SortableTh } from '../components/SortableTh'
import {
  aggregateByCase,
  cdfPoints,
  groupMean,
  pairwiseCompare,
  paretoFront,
  radarAxes,
  shortFailureCategory,
} from '../lib/compare'
import { formatScore, loadSubmissionDetails } from '../lib/data'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import { sortByAccessors, useTableSort } from '../lib/tableSort'
import type { SubmissionDetail } from '../lib/types'

const COLORS = ['#00d4ff', '#f97316', '#3b82f6', '#8b5cf6', '#eab308', '#ec4899']

type PairSortKey =
  | 'scenario'
  | 'problem'
  | 'a_rca'
  | 'b_rca'
  | 'delta'
  | 'winner'

export function ComparePage() {
  const { filtered, loading, error } = useLeaderboardData()
  const [params, setParams] = useSearchParams()
  const [details, setDetails] = useState<SubmissionDetail[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [pairA, setPairA] = useState('')
  const [pairB, setPairB] = useState('')
  const [detailError, setDetailError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const { sort: pairSort, toggle: togglePairSort } = useTableSort<PairSortKey>({
    key: 'delta',
    dir: 'desc',
  })

  useEffect(() => {
    if (loading || initialized) return
    if (!filtered.length) return
    const valid = new Set(filtered.map((s) => s.id))
    const fromUrl = (params.get('ids') || '')
      .split(',')
      .map((s) => s.trim())
      .filter((id) => valid.has(id))
    const initial =
      fromUrl.length > 0
        ? fromUrl
        : filtered.slice(0, 3).map((s) => s.id)
    setSelected(initial)
    if (initial.length >= 2) {
      setPairA(initial[0])
      setPairB(initial[1])
    }
    setInitialized(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filtered, initialized])

  // Keep selection inside the shared filter set.
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
    setPairA((prev) => (prev && !valid.has(prev) ? '' : prev))
    setPairB((prev) => (prev && !valid.has(prev) ? '' : prev))
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

  const toggleId = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id]
    syncUrl(next)
  }

  const pairwise = useMemo(() => {
    const a = details.find((d) => d.id === pairA)
    const b = details.find((d) => d.id === pairB)
    if (!a || !b || a.id === b.id) return null
    return pairwiseCompare(a, b)
  }, [details, pairA, pairB])

  const pairwiseRows = useMemo(() => {
    if (!pairwise) return []
    const accessors = {
      scenario: (r: (typeof pairwise.rows)[number]) => r.scenario,
      problem: (r: (typeof pairwise.rows)[number]) => r.problem,
      a_rca: (r: (typeof pairwise.rows)[number]) => r.a_rca,
      b_rca: (r: (typeof pairwise.rows)[number]) => r.b_rca,
      delta: (r: (typeof pairwise.rows)[number]) => r.delta,
      winner: (r: (typeof pairwise.rows)[number]) =>
        r.winner === 'tie'
          ? 'tie'
          : r.winner === 'a'
            ? pairwise.aName
            : pairwise.bName,
    }
    return sortByAccessors(pairwise.rows, pairSort, accessors).slice(0, 40)
  }, [pairwise, pairSort])

  const radarOption = useMemo((): EChartsOption => {
    const axes = details.map(radarAxes)
    const maxTokens = Math.max(...axes.map((a) => a.tokens), 1)
    const maxSteps = Math.max(...axes.map((a) => a.steps), 1)
    const indicators = [
      { name: 'Detection', max: 1 },
      { name: 'Localization', max: 1 },
      { name: 'RCA F1', max: 1 },
      { name: 'Success', max: 1 },
      { name: 'Token eff.', max: 1 },
      { name: 'Step eff.', max: 1 },
    ]
    return {
      tooltip: {},
      legend: { data: details.map((d) => d.name), bottom: 0 },
      radar: { indicator: indicators },
      series: [
        {
          type: 'radar',
          data: details.map((d, i) => {
            const a = axes[i]
            return {
              name: d.name,
              value: [
                a.detection,
                a.localization,
                a.rca,
                a.success,
                1 - a.tokens / maxTokens,
                1 - a.steps / maxSteps,
              ],
              lineStyle: { color: COLORS[i % COLORS.length] },
              itemStyle: { color: COLORS[i % COLORS.length] },
            }
          }),
        },
      ],
    }
  }, [details])

  const scatterOption = useMemo((): EChartsOption => {
    const xs = details.flatMap((d) =>
      aggregateByCase(d.trials)
        .filter((c) => c.mean_tokens != null)
        .map((c) => c.mean_tokens!),
    )
    const xMin = xs.length ? Math.min(...xs) : 0
    const xMax = xs.length ? Math.max(...xs) : 1
    const xPad = Math.max((xMax - xMin) * 0.08, xMax * 0.02 || 1)
    return {
      tooltip: {
        formatter: (p: unknown) => {
          const item = p as { seriesName: string; value: number[] }
          return `${item.seriesName}<br/>tokens: ${Math.round(item.value[0])}<br/>RCA F1: ${item.value[1].toFixed(3)}`
        },
      },
      legend: { data: details.map((d) => d.name), bottom: 0 },
      grid: { left: 56, right: 28, top: 28, bottom: 64, containLabel: true },
      xAxis: {
        name: 'Mean tokens / case',
        type: 'value',
        min: Math.max(0, xMin - xPad),
        max: xMax + xPad,
      },
      yAxis: { name: 'Mean RCA F1', type: 'value', min: 0, max: 1.05 },
      series: details.map((d, i) => {
        const cases = aggregateByCase(d.trials)
        return {
          name: d.name,
          type: 'scatter',
          symbolSize: 12,
          itemStyle: { color: COLORS[i % COLORS.length] },
          data: cases
            .filter((c) => c.mean_tokens != null)
            .map((c) => [c.mean_tokens!, c.mean_rca_f1]),
        }
      }),
    }
  }, [details])

  const paretoOption = useMemo((): EChartsOption => {
    const points = details
      .map((d, i) => ({
        id: d.id,
        name: d.name,
        cost: d.total_tokens ?? 0,
        score: d.mean_rca_f1 ?? 0,
        meanTokens: d.mean_tokens,
        color: COLORS[i % COLORS.length],
      }))
      .filter((p) => p.cost > 0)
    const front = paretoFront(points)
    const frontIds = new Set(front.map((p) => p.id))
    const xs = points.map((p) => p.cost)
    const xMin = xs.length ? Math.min(...xs) : 0
    const xMax = xs.length ? Math.max(...xs) : 1
    const xPad = Math.max((xMax - xMin) * 0.08, xMax * 0.02 || 1)

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as {
            seriesType?: string
            seriesName?: string
            data?: {
              name?: string
              value?: number[]
              meanTokens?: number | null
              onFrontier?: boolean
            }
          }
          if (p.seriesType === 'line') {
            return 'Pareto frontier (best RCA F1 at each cost)'
          }
          const d = p.data
          if (!d?.value) return p.seriesName || ''
          return [
            `<strong>${d.name}</strong>`,
            `RCA F1: ${d.value[1].toFixed(3)}`,
            `Total tokens: ${Math.round(d.value[0]).toLocaleString()}`,
            d.meanTokens != null
              ? `Avg tokens/trial: ${Math.round(d.meanTokens).toLocaleString()}`
              : null,
            d.onFrontier ? '<em>On Pareto frontier</em>' : null,
          ]
            .filter(Boolean)
            .join('<br/>')
        },
      },
      legend: {
        data: [...details.map((d) => d.name), 'Pareto frontier'],
        bottom: 0,
        type: 'scroll',
      },
      grid: { left: 56, right: 36, top: 36, bottom: 72, containLabel: true },
      xAxis: {
        name: 'Total tokens',
        type: 'value',
        min: Math.max(0, xMin - xPad),
        max: xMax + xPad,
        nameLocation: 'middle',
        nameGap: 28,
      },
      yAxis: {
        name: 'Mean RCA F1',
        type: 'value',
        min: 0,
        max: 1.05,
        nameLocation: 'middle',
        nameGap: 40,
      },
      series: [
        ...points.map((p) => ({
          name: p.name,
          type: 'scatter' as const,
          symbolSize: frontIds.has(p.id) ? 18 : 14,
          itemStyle: {
            color: p.color,
            borderColor: frontIds.has(p.id) ? '#080d18' : '#e2e8f0',
            borderWidth: frontIds.has(p.id) ? 2 : 1,
          },
          data: [
            {
              name: p.name,
              value: [p.cost, p.score],
              meanTokens: p.meanTokens,
              onFrontier: frontIds.has(p.id),
            },
          ],
          label: {
            show: points.length <= 12,
            formatter: p.name,
            position: 'right' as const,
            fontSize: 11,
            color: '#e2e8f0',
          },
        })),
        {
          name: 'Pareto frontier',
          type: 'line' as const,
          showSymbol: false,
          silent: true,
          data: front.map((p) => [p.cost, p.score]),
          lineStyle: {
            type: 'dashed',
            width: 2,
            color: '#8b9cb6',
            opacity: 0.9,
          },
          z: 1,
        },
      ] as EChartsOption['series'],
    }
  }, [details])

  const tokenBarOption = useMemo((): EChartsOption => {
    const colorById = new Map(
      details.map((d, i) => [d.id, COLORS[i % COLORS.length]]),
    )
    const rows = [...details].sort(
      (a, b) => (b.total_tokens ?? 0) - (a.total_tokens ?? 0),
    )
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const list = params as Array<{
            name: string
            value: number
            dataIndex: number
          }>
          const p = list[0]
          if (!p) return ''
          const d = rows[p.dataIndex]
          return [
            `<strong>${p.name}</strong>`,
            `Total tokens: ${Math.round(p.value).toLocaleString()}`,
            d?.mean_tokens != null
              ? `Avg / trial: ${Math.round(d.mean_tokens).toLocaleString()}`
              : null,
            d?.mean_rca_f1 != null
              ? `RCA F1: ${d.mean_rca_f1.toFixed(3)}`
              : null,
          ]
            .filter(Boolean)
            .join('<br/>')
        },
      },
      grid: { left: 48, right: 28, top: 28, bottom: 96, containLabel: true },
      xAxis: {
        type: 'category',
        data: rows.map((d) => d.name),
        axisLabel: { rotate: 28, fontSize: 11, interval: 0 },
      },
      yAxis: {
        type: 'value',
        name: 'Total tokens',
        nameLocation: 'middle',
        nameGap: 52,
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 48,
          data: rows.map((d) => ({
            value: d.total_tokens ?? 0,
            itemStyle: { color: colorById.get(d.id) || COLORS[0] },
          })),
          label: {
            show: rows.length <= 10,
            position: 'top',
            formatter: (p: unknown) => {
              const v = (p as { value: number }).value
              if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
              if (v >= 1_000) return `${Math.round(v / 1_000)}k`
              return `${Math.round(v)}`
            },
            fontSize: 10,
          },
        },
      ],
    }
  }, [details])

  const cdfOption = useMemo((): EChartsOption => {
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: details.map((d) => d.name), bottom: 0 },
      grid: { left: 56, right: 28, top: 28, bottom: 64, containLabel: true },
      xAxis: { name: 'Mean RCA F1 (per case)', type: 'value', min: 0, max: 1 },
      yAxis: { name: 'CDF', type: 'value', min: 0, max: 1 },
      series: details.map((d, i) => ({
        name: d.name,
        type: 'line',
        showSymbol: false,
        itemStyle: { color: COLORS[i % COLORS.length] },
        data: cdfPoints(
          aggregateByCase(d.trials).map((c) => c.mean_rca_f1 || 0),
        ),
      })),
    }
  }, [details])

  const radialOption = useMemo((): EChartsOption => {
    const categories = new Set<string>()
    const byDetail = details.map((d) => {
      const groups = groupMean(
        d.trials,
        (t) => t.root_cause_category || 'unknown',
      )
      for (const g of groups) categories.add(g.key)
      return new Map(groups.map((g) => [g.key, g.mean]))
    })
    const cats = [...categories].sort()
    const shortCats = cats.map(shortFailureCategory)
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as {
            seriesName: string
            name: string
            value: number
            dataIndex: number
          }
          const full = cats[p.dataIndex] || p.name
          return `${p.seriesName}<br/>${full}<br/>RCA F1: ${Number(p.value).toFixed(3)}`
        },
      },
      legend: { data: details.map((d) => d.name), bottom: 0 },
      polar: { radius: ['18%', '68%'] },
      angleAxis: {
        type: 'category',
        data: shortCats,
        axisLabel: {
          interval: 0,
          fontSize: 11,
          color: '#e2e8f0',
          margin: 10,
        },
      },
      radiusAxis: { min: 0, max: 1, axisLabel: { fontSize: 10 } },
      series: details.map((d, i) => ({
        type: 'bar',
        coordinateSystem: 'polar',
        name: d.name,
        data: cats.map((c) => byDetail[i].get(c) ?? 0),
        itemStyle: { color: COLORS[i % COLORS.length] },
      })),
    }
  }, [details])

  if (loading) return <p className="status">Loading compare view…</p>
  if (error || detailError) {
    return (
      <p className="status status--error">{error || detailError}</p>
    )
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Compare Entries</h1>
          <p className="lede">Select entries to compare.</p>
        </div>
        <Link className="btn btn--ghost" to="/">
          Back to leaderboard
        </Link>
      </div>

      <EntryPicker
        selected={selected}
        onToggle={toggleId}
        onSetSelected={syncUrl}
      />

      <div className="chart-grid chart-grid--stack">
        <ChartPanel
          title="Radar (higher is better; cost inverted)"
          option={radarOption}
          filename="nika-radar"
          empty={!details.length}
          height={520}
          zoomable={false}
        />
        <ChartPanel
          title="Scatter: tokens vs RCA F1 (per case)"
          option={scatterOption}
          filename="nika-scatter"
          empty={!details.length}
          height={520}
        />
        <ChartPanel
          title="RCA F1 vs cost frontier"
          option={paretoOption}
          filename="nika-pareto-frontier"
          empty={!details.length || details.every((d) => !(d.total_tokens && d.total_tokens > 0))}
          emptyMessage="No token totals available for the selected entries."
          height={520}
        />
        <ChartPanel
          title="Total tokens per entry"
          option={tokenBarOption}
          filename="nika-total-tokens"
          empty={!details.length || details.every((d) => !(d.total_tokens && d.total_tokens > 0))}
          emptyMessage="No token totals available for the selected entries."
          height={480}
          zoomable={false}
        />
        <ChartPanel
          title="CDF of per-case mean RCA F1"
          option={cdfOption}
          filename="nika-cdf"
          empty={!details.length}
          height={520}
        />
        <ChartPanel
          title="Radial: mean RCA F1 by failure category"
          option={radialOption}
          filename="nika-radial"
          empty={!details.length}
          height={560}
          zoomable={false}
        />
      </div>

      <section className="pairwise">
        <h2>Pairwise case comparison</h2>
        <div className="pairwise__controls">
          <label>
            A
            <select value={pairA} onChange={(e) => setPairA(e.target.value)}>
              {details.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            B
            <select value={pairB} onChange={(e) => setPairB(e.target.value)}>
              {details.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {pairwise ? (
          <>
            <p className="muted">
              Compared {pairwise.compared} cases · {pairwise.aName} wins{' '}
              {pairwise.aWins} · {pairwise.bName} wins {pairwise.bWins} · ties{' '}
              {pairwise.ties}
            </p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortableTh
                      label="Scenario"
                      sortKey="scenario"
                      sort={pairSort}
                      onSort={togglePairSort}
                    />
                    <SortableTh
                      label="Problem"
                      sortKey="problem"
                      sort={pairSort}
                      onSort={togglePairSort}
                    />
                    <SortableTh
                      label={pairwise.aName}
                      sortKey="a_rca"
                      sort={pairSort}
                      onSort={togglePairSort}
                    />
                    <SortableTh
                      label={pairwise.bName}
                      sortKey="b_rca"
                      sort={pairSort}
                      onSort={togglePairSort}
                    />
                    <SortableTh
                      label="Δ"
                      sortKey="delta"
                      sort={pairSort}
                      onSort={togglePairSort}
                    />
                    <SortableTh
                      label="Winner"
                      sortKey="winner"
                      sort={pairSort}
                      onSort={togglePairSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {pairwiseRows.map((r) => (
                    <tr key={r.case_key}>
                      <td>{r.scenario}</td>
                      <td>{r.problem}</td>
                      <td className="num">{formatScore(r.a_rca)}</td>
                      <td className="num">{formatScore(r.b_rca)}</td>
                      <td className="num">{formatScore(r.delta)}</td>
                      <td>
                        {r.winner === 'tie'
                          ? 'tie'
                          : r.winner === 'a'
                            ? pairwise.aName
                            : pairwise.bName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted">Select two different entries for pairwise.</p>
        )}
      </section>
    </div>
  )
}
