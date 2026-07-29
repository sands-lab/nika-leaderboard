import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { EChartsOption } from 'echarts'
import { ChartPanel } from '../components/ChartPanel'
import { EntryPicker } from '../components/EntryPicker'
import {
  aggregateByCase,
  cdfPoints,
  groupMean,
  pairwiseCompare,
  radarAxes,
  shortFailureCategory,
} from '../lib/compare'
import { formatScore, loadSubmissionDetails } from '../lib/data'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import type { SubmissionDetail } from '../lib/types'

const COLORS = ['#0e7490', '#ea580c', '#1d4ed8', '#7c3aed', '#ca8a04', '#be123c']

export function ComparePage() {
  const { filtered, loading, error } = useLeaderboardData()
  const [params, setParams] = useSearchParams()
  const [details, setDetails] = useState<SubmissionDetail[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [pairA, setPairA] = useState('')
  const [pairB, setPairB] = useState('')
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
    return {
      tooltip: {
        formatter: (p: unknown) => {
          const item = p as { seriesName: string; value: number[] }
          return `${item.seriesName}<br/>tokens: ${Math.round(item.value[0])}<br/>RCA F1: ${item.value[1].toFixed(3)}`
        },
      },
      legend: { data: details.map((d) => d.name), bottom: 0 },
      xAxis: { name: 'Mean tokens / case', type: 'value' },
      yAxis: { name: 'Mean RCA F1', type: 'value', min: 0, max: 1 },
      series: details.map((d, i) => {
        const cases = aggregateByCase(d.trials)
        return {
          name: d.name,
          type: 'scatter',
          symbolSize: 10,
          itemStyle: { color: COLORS[i % COLORS.length] },
          data: cases
            .filter((c) => c.mean_tokens != null)
            .map((c) => [c.mean_tokens!, c.mean_rca_f1]),
        }
      }),
    }
  }, [details])

  const parallelOption = useMemo((): EChartsOption => {
    const maxTokens = Math.max(...details.map((d) => d.mean_tokens ?? 0), 1)
    const maxSteps = Math.max(...details.map((d) => d.mean_steps ?? 0), 1)
    return {
      parallelAxis: [
        { dim: 0, name: 'Detection', min: 0, max: 1 },
        { dim: 1, name: 'Loc F1', min: 0, max: 1 },
        { dim: 2, name: 'RCA F1', min: 0, max: 1 },
        { dim: 3, name: 'Success', min: 0, max: 1 },
        { dim: 4, name: 'Avg tokens (norm)', min: 0, max: 1 },
        { dim: 5, name: 'Avg steps (norm)', min: 0, max: 1 },
      ],
      series: {
        type: 'parallel',
        lineStyle: { width: 2 },
        data: details.map((d, i) => {
          return {
            value: [
              d.mean_detection_score ?? 0,
              d.mean_localization_f1 ?? 0,
              d.mean_rca_f1 ?? 0,
              d.success_rate ?? 0,
              (d.mean_tokens ?? 0) / maxTokens,
              (d.mean_steps ?? 0) / maxSteps,
            ],
            name: d.name,
            lineStyle: { color: COLORS[i % COLORS.length] },
          }
        }),
      },
      legend: { data: details.map((d) => d.name), bottom: 0 },
    }
  }, [details])

  const cdfOption = useMemo((): EChartsOption => {
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: details.map((d) => d.name), bottom: 0 },
      xAxis: { name: 'RCA F1', type: 'value', min: 0, max: 1 },
      yAxis: { name: 'CDF', type: 'value', min: 0, max: 1 },
      series: details.map((d, i) => ({
        name: d.name,
        type: 'line',
        showSymbol: false,
        itemStyle: { color: COLORS[i % COLORS.length] },
        data: cdfPoints(d.trials.map((t) => t.rca_f1 || 0)),
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
          color: '#1c2421',
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
          <h1>Compare results</h1>
          <p className="lede">Select entries to compare.</p>
        </div>
        <Link className="btn btn--ghost" to="/">
          Back to table
        </Link>
      </div>

      <EntryPicker
        selected={selected}
        onToggle={toggleId}
        onSetSelected={syncUrl}
      />

      <div className="chart-grid">
        <ChartPanel
          title="Radar (higher is better; cost inverted)"
          option={radarOption}
          filename="nika-radar"
          empty={!details.length}
          zoomable={false}
        />
        <ChartPanel
          title="Scatter: tokens vs RCA F1 (per case)"
          option={scatterOption}
          filename="nika-scatter"
          empty={!details.length}
        />
        <ChartPanel
          title="Parallel coordinates"
          option={parallelOption}
          filename="nika-parallel"
          empty={!details.length}
          zoomable={false}
        />
        <ChartPanel
          title="CDF of per-trial RCA F1"
          option={cdfOption}
          filename="nika-cdf"
          empty={!details.length}
        />
        <ChartPanel
          title="Radial: mean RCA F1 by failure category"
          option={radialOption}
          filename="nika-radial"
          empty={!details.length}
          height={420}
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
                    <th>Scenario</th>
                    <th>Problem</th>
                    <th>{pairwise.aName}</th>
                    <th>{pairwise.bName}</th>
                    <th>Δ</th>
                    <th>Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {pairwise.rows.slice(0, 40).map((r) => (
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
