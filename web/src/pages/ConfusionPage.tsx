import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { EChartsOption } from 'echarts'
import { ChartPanel } from '../components/ChartPanel'
import { EntryPicker } from '../components/EntryPicker'
import {
  type ConfusionLevel,
  axisLabel,
  buildConfusionMatrix,
  hasUsablePredictions,
  topConfusionPairs,
} from '../lib/confusion'
import { loadSubmissionDetails } from '../lib/data'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import type { SubmissionDetail } from '../lib/types'

type ValueMode = 'rate' | 'count'

const HEAT_COLORS = [
  '#0d1525',
  '#0f2940',
  '#0a4a6e',
  '#0284c7',
  '#00d4ff',
  '#67e8f9',
]

export function ConfusionPage() {
  const { filtered, loading, error } = useLeaderboardData()
  const [params, setParams] = useSearchParams()
  const [details, setDetails] = useState<SubmissionDetail[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [valueMode, setValueMode] = useState<ValueMode>('rate')
  const [level, setLevel] = useState<ConfusionLevel>('category')
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
        if (!cancelled) {
          setDetailError(e instanceof Error ? e.message : String(e))
        }
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

  const matrix = useMemo(
    () => buildConfusionMatrix(details, level),
    [details, level],
  )
  const pairs = useMemo(
    () => topConfusionPairs(matrix, level === 'problem' ? 15 : 10, {
      offDiagonalOnly: true,
    }),
    [matrix, level],
  )
  const usable = hasUsablePredictions(details)

  const heatmapOption = useMemo((): EChartsOption => {
    const labels = matrix.labels.map((l) => axisLabel(l, level))
    const data: Array<[number, number, number]> = []
    let max = 0
    for (let i = 0; i < matrix.labels.length; i++) {
      for (let j = 0; j < matrix.labels.length; j++) {
        const v =
          valueMode === 'rate' ? matrix.rates[i][j] * 100 : matrix.counts[i][j]
        data.push([j, i, Number(v.toFixed(valueMode === 'rate' ? 1 : 0))])
        if (v > max) max = v
      }
    }
    const isProblem = level === 'problem'
    const n = matrix.labels.length
    return {
      tooltip: {
        position: 'top',
        formatter: (p: unknown) => {
          const item = p as { data: [number, number, number] }
          const [pj, pi] = item.data
          const trueL = matrix.labels[pi]
          const predL = matrix.labels[pj]
          const count = matrix.counts[pi][pj]
          const rate = matrix.rates[pi][pj]
          return [
            `<strong>${axisLabel(trueL, level)}</strong> → <strong>${axisLabel(predL, level)}</strong>`,
            `% of this true class: ${(rate * 100).toFixed(1)}%`,
            `Raw pair count: ${count}`,
          ].join('<br/>')
        },
      },
      grid: {
        left: isProblem ? 120 : 88,
        right: 72,
        top: 40,
        bottom: isProblem ? 110 : 72,
      },
      xAxis: {
        type: 'category',
        data: labels,
        name: level === 'category' ? 'Predicted failure' : 'Predicted RCA name',
        nameLocation: 'middle',
        nameGap: isProblem ? 80 : 36,
        splitArea: { show: true },
        axisLabel: {
          rotate: isProblem ? 55 : 28,
          fontSize: isProblem ? 9 : 11,
          interval: 0,
        },
      },
      yAxis: {
        type: 'category',
        data: labels,
        name: level === 'category' ? 'True failure' : 'True RCA name',
        nameLocation: 'middle',
        nameGap: isProblem ? 100 : 64,
        splitArea: { show: true },
        axisLabel: { fontSize: isProblem ? 9 : 11, interval: 0 },
      },
      visualMap: {
        min: 0,
        max: Math.max(max, valueMode === 'rate' ? 1 : 0.01),
        calculable: true,
        orient: 'vertical',
        right: 4,
        top: 'middle',
        text: valueMode === 'rate' ? ['%', ''] : ['count', ''],
        inRange: { color: HEAT_COLORS },
        formatter: (v: unknown) =>
          valueMode === 'rate'
            ? `${Number(v).toFixed(0)}%`
            : `${Number(v).toFixed(0)}`,
      },
      series: [
        {
          type: 'heatmap',
          data,
          label: {
            show: !isProblem || n <= 20,
            fontSize: isProblem ? 8 : 10,
            formatter: (p: unknown) => {
              const v = (p as { data: [number, number, number] }).data[2]
              if (v <= 0) return ''
              return `${v}`
            },
          },
          emphasis: {
            itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.25)' },
          },
        },
      ],
    }
  }, [matrix, valueMode, level])

  const sankeyOption = useMemo((): EChartsOption => {
    const nodes = new Map<string, { name: string }>()
    const links: Array<{ source: string; target: string; value: number }> = []

    for (const pair of topConfusionPairs(matrix, 24, { offDiagonalOnly: true })) {
      if (pair.count < 1) continue
      const source = `T:${axisLabel(pair.trueLabel, level)}`
      const target = `P:${axisLabel(pair.predictedLabel, level)}`
      nodes.set(source, { name: source })
      nodes.set(target, { name: target })
      links.push({ source, target, value: pair.count })
    }

    if (!links.length) return {}

    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: unknown) => {
          const item = p as {
            dataType?: string
            name?: string
            data?: { source?: string; target?: string; value?: number }
          }
          if (item.dataType === 'edge' && item.data) {
            return `${item.data.source} → ${item.data.target}<br/>${item.data.value}`
          }
          return item.name || ''
        },
      },
      series: [
        {
          type: 'sankey',
          emphasis: { focus: 'adjacency' },
          nodeAlign: 'left',
          lineStyle: { color: 'gradient', curveness: 0.45, opacity: 0.35 },
          label: { fontSize: level === 'problem' ? 10 : 11, color: '#e2e8f0' },
          data: [...nodes.values()],
          links,
        },
      ],
    }
  }, [matrix, level])

  if (loading) return <p className="status">Loading confusion view…</p>
  if (error) return <p className="status status--error">{error}</p>

  const heatHeight =
    level === 'problem'
      ? Math.min(900, Math.max(520, matrix.labels.length * 18 + 160))
      : 480

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>RCA Confusion</h1>
          <p className="lede">
            True RCA → predicted RCA. Cells are either raw true→pred pair counts,
            or that count as a percent of the true class.
          </p>
        </div>
      </div>

      <div className="confusion-layout">
        <EntryPicker
          selected={selected}
          onToggle={(id) => {
            const next = selected.includes(id)
              ? selected.filter((x) => x !== id)
              : [...selected, id]
            syncUrl(next)
          }}
          onSetSelected={syncUrl}
          subtitle={(s) => s.model || '—'}
        />

        <div className="confusion-main">
          {detailError && (
            <p className="status status--error">{detailError}</p>
          )}

          <section className="insights-controls">
            <div className="insights-controls__row">
              <label>
                Axis
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as ConfusionLevel)}
                >
                  <option value="category">Failure category</option>
                  <option value="problem">RCA problem name</option>
                </select>
              </label>
              <label>
                Cell shows
                <select
                  value={valueMode}
                  onChange={(e) => setValueMode(e.target.value as ValueMode)}
                >
                  <option value="rate">% of true class</option>
                  <option value="count">Raw pair counts</option>
                </select>
              </label>
              <p className="muted insights-controls__status">
                {matrix.edgeCount} true→pred pairs · {matrix.trialCount} trials
                with predictions · {matrix.missingPredictionCount} missing
              </p>
            </div>
          </section>

          {!usable && details.length > 0 ? (
            <p className="status">
              Selected packages have no{' '}
              <code>predicted_root_cause_name</code> in trial results.
            </p>
          ) : (
            <>
              <ChartPanel
                title={
                  level === 'category'
                    ? 'Category confusion'
                    : 'Problem-name confusion'
                }
                option={heatmapOption}
                filename={`rca-confusion-${level}`}
                height={heatHeight}
                empty={!matrix.labels.length}
                zoomable={false}
              />

              <ChartPanel
                title="Misclassification flows"
                option={sankeyOption}
                filename={`rca-confusion-sankey-${level}`}
                height={420}
                empty={!Object.keys(sankeyOption).length}
                zoomable={false}
              />

              <section className="pairwise insights-pairs">
                <h2>Top confused pairs</h2>
                {pairs.length === 0 ? (
                  <p className="muted">No off-diagonal mass yet.</p>
                ) : (
                  <ul className="confusion-pair-list">
                    {pairs.map((p) => (
                      <li key={`${p.trueLabel}->${p.predictedLabel}`}>
                        <span className="confusion-pair-list__flow">
                          <strong>{axisLabel(p.trueLabel, level)}</strong>
                          <span aria-hidden="true"> → </span>
                          <strong>{axisLabel(p.predictedLabel, level)}</strong>
                        </span>
                        <span className="muted">
                          {p.count} pairs · {(p.rate * 100).toFixed(1)}% of this
                          true class
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
