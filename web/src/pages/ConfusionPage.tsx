import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { EChartsOption } from 'echarts'
import { ChartPanel } from '../components/ChartPanel'
import { EntryPicker } from '../components/EntryPicker'
import {
  buildCategoryConfusion,
  categoryLabel,
  hasUsablePredictions,
  predictionSourceNote,
  topConfusionPairs,
} from '../lib/confusion'
import { loadSubmissionDetails } from '../lib/data'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import type { SubmissionDetail } from '../lib/types'

type ValueMode = 'rate' | 'count'

const HEAT_COLORS = [
  '#f8fafc',
  '#e0f2fe',
  '#7dd3fc',
  '#0ea5e9',
  '#0369a1',
  '#0c4a6e',
]

export function ConfusionPage() {
  const { filtered, loading, error } = useLeaderboardData()
  const [params, setParams] = useSearchParams()
  const [details, setDetails] = useState<SubmissionDetail[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [valueMode, setValueMode] = useState<ValueMode>('rate')
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

  const matrix = useMemo(() => buildCategoryConfusion(details), [details])
  const pairs = useMemo(
    () => topConfusionPairs(matrix, 10, { offDiagonalOnly: true }),
    [matrix],
  )
  const usable = hasUsablePredictions(details)
  const sourceNote = predictionSourceNote(details)

  const heatmapOption = useMemo((): EChartsOption => {
    const labels = matrix.categories.map(categoryLabel)
    const data: Array<[number, number, number]> = []
    let max = 0
    for (let i = 0; i < matrix.categories.length; i++) {
      for (let j = 0; j < matrix.categories.length; j++) {
        const v =
          valueMode === 'rate' ? matrix.rates[i][j] * 100 : matrix.counts[i][j]
        data.push([j, i, Number(v.toFixed(valueMode === 'rate' ? 1 : 2))])
        if (v > max) max = v
      }
    }
    return {
      tooltip: {
        position: 'top',
        formatter: (p: unknown) => {
          const item = p as { data: [number, number, number] }
          const [pj, pi, val] = item.data
          const trueCat = matrix.categories[pi]
          const predCat = matrix.categories[pj]
          const count = matrix.counts[pi][pj]
          const rate = matrix.rates[pi][pj]
          return [
            `<strong>${categoryLabel(trueCat)}</strong> → <strong>${categoryLabel(predCat)}</strong>`,
            `Share of true row: ${(rate * 100).toFixed(1)}%`,
            `Weighted count: ${count.toFixed(2)}`,
            valueMode === 'rate'
              ? `Cell: ${val}%`
              : `Cell: ${val}`,
          ].join('<br/>')
        },
      },
      grid: { left: 88, right: 72, top: 40, bottom: 72 },
      xAxis: {
        type: 'category',
        data: labels,
        name: 'Predicted failure',
        nameLocation: 'middle',
        nameGap: 36,
        splitArea: { show: true },
        axisLabel: { rotate: 28, fontSize: 11 },
      },
      yAxis: {
        type: 'category',
        data: labels,
        name: 'True failure',
        nameLocation: 'middle',
        nameGap: 64,
        splitArea: { show: true },
        axisLabel: { fontSize: 11 },
      },
      visualMap: {
        min: 0,
        max: Math.max(max, valueMode === 'rate' ? 1 : 0.01),
        calculable: true,
        orient: 'vertical',
        right: 4,
        top: 'middle',
        text: valueMode === 'rate' ? ['%', ''] : ['n', ''],
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
            show: true,
            fontSize: 10,
            formatter: (p: unknown) => {
              const v = (p as { data: [number, number, number] }).data[2]
              if (v <= 0) return ''
              return valueMode === 'rate' ? `${v}` : `${v}`
            },
          },
          emphasis: {
            itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.25)' },
          },
        },
      ],
    }
  }, [matrix, valueMode])

  const sankeyOption = useMemo((): EChartsOption => {
    const nodes = new Map<string, { name: string }>()
    const links: Array<{ source: string; target: string; value: number }> = []

    for (const pair of topConfusionPairs(matrix, 24, { offDiagonalOnly: true })) {
      if (pair.count < 0.5) continue
      const source = `T:${categoryLabel(pair.trueCategory)}`
      const target = `P:${categoryLabel(pair.predictedCategory)}`
      nodes.set(source, { name: source })
      nodes.set(target, { name: target })
      links.push({ source, target, value: Number(pair.count.toFixed(2)) })
    }

    if (!links.length) {
      return {}
    }

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
          label: { fontSize: 11, color: '#1c2421' },
          data: [...nodes.values()],
          links,
        },
      ],
    }
  }, [matrix])

  if (loading) return <p className="status">Loading confusion view…</p>
  if (error) return <p className="status status--error">{error}</p>

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>RCA Confusion</h1>
          <p className="lede">
            True failure category → predicted category. Shows which failures are
            most often mistaken for others in RCA.
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
          subtitle={(s) =>
            [
              s.model || '—',
              s.has_rca_predictions
                ? `preds: ${s.rca_prediction_source || 'yes'}`
                : 'no preds',
            ].join(' · ')
          }
        />

        <div className="confusion-main">
          {detailError && (
            <p className="status status--error">{detailError}</p>
          )}

          <section className="insights-controls">
            <div className="insights-controls__row">
              <label>
                Cell value
                <select
                  value={valueMode}
                  onChange={(e) => setValueMode(e.target.value as ValueMode)}
                >
                  <option value="rate">Row share (%)</option>
                  <option value="count">Weighted count</option>
                </select>
              </label>
              <p className="muted insights-controls__status">
                {matrix.trialCount} trials · {matrix.emptyPredictionCount} with
                no prediction
              </p>
            </div>
            {sourceNote && <p className="muted confusion-note">{sourceNote}</p>}
          </section>

          {!usable && details.length > 0 ? (
            <p className="status">
              Selected packages have no predicted RCA names. Pack{' '}
              <code>predicted_root_cause_names</code> into trials, or add an{' '}
              <code>enrichment/rca_predictions/</code> sidecar.
            </p>
          ) : (
            <>
              <ChartPanel
                title="Category confusion"
                option={heatmapOption}
                filename="rca-category-confusion"
                height={480}
                empty={!matrix.categories.length}
                zoomable={false}
              />

              <ChartPanel
                title="Misclassification flows"
                option={sankeyOption}
                filename="rca-confusion-sankey"
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
                      <li key={`${p.trueCategory}->${p.predictedCategory}`}>
                        <span className="confusion-pair-list__flow">
                          <strong>{categoryLabel(p.trueCategory)}</strong>
                          <span aria-hidden="true"> → </span>
                          <strong>{categoryLabel(p.predictedCategory)}</strong>
                        </span>
                        <span className="muted">
                          {p.count.toFixed(1)} trials ·{' '}
                          {(p.rate * 100).toFixed(1)}% of true row
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
