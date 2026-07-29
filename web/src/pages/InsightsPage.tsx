import { useEffect, useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { ChartPanel } from '../components/ChartPanel'
import { formatPct } from '../lib/data'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import {
  type BubbleAxisKey,
  type BubblePoint,
  type PairAnnotation,
  BUBBLE_AXIS_OPTIONS,
  axisPlotValue,
  axisRange,
  bubbleAxisOption,
  familyColor,
  formatAxisDelta,
  formatAxisValue,
  formatDeltaPp,
  inferModelFamily,
  makePairId,
  shortLabel,
} from '../lib/insights'
import type { SubmissionSummary } from '../lib/types'

const ARROW_COLORS = ['#0e7490', '#ea580c', '#1d4ed8', '#7c3aed', '#ca8a04', '#0b1220']

function toPoint(s: SubmissionSummary): BubblePoint {
  return {
    id: s.id,
    name: s.name,
    label: shortLabel(s.name, s.model, s.framework),
    model: s.model,
    framework: s.framework,
    family: inferModelFamily(s.model),
    detection: s.mean_detection_score ?? 0,
    localization: s.mean_localization_f1 ?? 0,
    rca: s.mean_rca_f1 ?? 0,
    cases: s.case_count ?? s.n_trials_expected ?? 0,
    success_rate: s.success_rate ?? 0,
    mean_tokens: s.mean_tokens ?? 0,
    mean_steps: s.mean_steps ?? 0,
  }
}

function sizeScale(cases: number, minC: number, maxC: number): number {
  if (maxC <= minC) return 28
  const t = (cases - minC) / (maxC - minC)
  return 16 + t * 36
}

function rcaOpacity(rca: number, minR: number, maxR: number): number {
  if (maxR <= minR) return 0.75
  const t = (rca - minR) / (maxR - minR)
  return 0.28 + t * 0.72
}

export function InsightsPage() {
  const { filtered, loading, error } = useLeaderboardData()
  const [pendingFrom, setPendingFrom] = useState<string | null>(null)
  const [pairs, setPairs] = useState<PairAnnotation[]>([])
  const [draftLabel, setDraftLabel] = useState('Relative gain')
  const [draftColor, setDraftColor] = useState(ARROW_COLORS[0])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [xAxisKey, setXAxisKey] = useState<BubbleAxisKey>('detection')
  const [yAxisKey, setYAxisKey] = useState<BubbleAxisKey>('localization')

  const swapAxes = () => {
    setXAxisKey(yAxisKey)
    setYAxisKey(xAxisKey)
  }

  const points = useMemo(() => filtered.map(toPoint), [filtered])

  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points])

  // Drop annotations whose endpoints are filtered out.
  useEffect(() => {
    const ids = new Set(points.map((p) => p.id))
    setPairs((prev) =>
      prev.filter((pair) => ids.has(pair.fromId) && ids.has(pair.toId)),
    )
    setPendingFrom((prev) => (prev && !ids.has(prev) ? null : prev))
    setFocusId((prev) => (prev && !ids.has(prev) ? null : prev))
  }, [points])

  const extents = useMemo(() => {
    const cases = points.map((p) => p.cases)
    const rcas = points.map((p) => p.rca)
    return {
      minC: Math.min(...cases, 0),
      maxC: Math.max(...cases, 1),
      minR: Math.min(...rcas, 0),
      maxR: Math.max(...rcas, 1),
    }
  }, [points])

  const onBubbleClick = (id: string) => {
    setFocusId(id)
    if (!pendingFrom) {
      setPendingFrom(id)
      return
    }
    if (pendingFrom === id) {
      setPendingFrom(null)
      return
    }
    const pairId = makePairId(pendingFrom, id)
    setPairs((prev) => {
      if (prev.some((p) => p.id === pairId)) return prev
      return [
        ...prev,
        {
          id: pairId,
          fromId: pendingFrom,
          toId: id,
          label: draftLabel.trim() || 'Δ',
          color: draftColor,
        },
      ]
    })
    setPendingFrom(null)
  }

  const removePair = (id: string) => {
    setPairs((prev) => prev.filter((p) => p.id !== id))
  }

  const updatePairLabel = (id: string, label: string) => {
    setPairs((prev) => prev.map((p) => (p.id === id ? { ...p, label } : p)))
  }

  const bubbleOption = useMemo((): EChartsOption => {
    const xOpt = bubbleAxisOption(xAxisKey)
    const yOpt = bubbleAxisOption(yAxisKey)
    const xRange = axisRange(points, xAxisKey)
    const yRange = axisRange(points, yAxisKey)
    const families = [...new Set(points.map((p) => p.family))].sort()
    const series = families.map((family) => {
      const subset = points.filter((p) => p.family === family)
      return {
        name: family,
        type: 'scatter' as const,
        data: subset.map((p) => ({
          value: [
            axisPlotValue(p, xAxisKey),
            axisPlotValue(p, yAxisKey),
            p.rca * 100,
            p.cases,
          ],
          id: p.id,
          name: p.label,
          point: p,
        })),
        symbolSize: (val: unknown) => {
          const v = val as number[]
          return sizeScale(v[3] ?? 0, extents.minC, extents.maxC)
        },
        itemStyle: {
          color: familyColor(family),
          opacity: 0.85,
          borderColor: '#fff',
          borderWidth: 1.5,
        },
        label: {
          show: true,
          formatter: (params: unknown) => {
            const p = params as { data: { name: string } }
            return p.data.name
          },
          position: 'right',
          fontSize: 11,
          color: '#1c2421',
        },
        emphasis: {
          scale: 1.12,
          itemStyle: { borderColor: '#083f32', borderWidth: 2 },
        },
      }
    })

    const arrowSeries = pairs
      .map((pair) => {
        const a = byId.get(pair.fromId)
        const b = byId.get(pair.toId)
        if (!a || !b) return null
        return {
          name: pair.label,
          type: 'line' as const,
          data: [
            [axisPlotValue(a, xAxisKey), axisPlotValue(a, yAxisKey)],
            [axisPlotValue(b, xAxisKey), axisPlotValue(b, yAxisKey)],
          ],
          symbol: ['circle', 'arrow'],
          symbolSize: [6, 14],
          showSymbol: true,
          lineStyle: { width: 2.5, color: pair.color, type: 'solid' as const },
          itemStyle: { color: pair.color },
          label: {
            show: true,
            formatter: () => {
              const dx = formatAxisDelta(a, b, xAxisKey)
              const dy = formatAxisDelta(a, b, yAxisKey)
              const dRca = formatDeltaPp(a.rca, b.rca)
              return `${pair.label}\n${xOpt.label} ${dx} · ${yOpt.label} ${dy} · RCA ${dRca}`
            },
            position: 'middle',
            color: pair.color,
            fontWeight: 600,
            fontSize: 11,
            backgroundColor: 'rgba(255,253,248,0.92)',
            padding: [4, 6],
            borderRadius: 4,
          },
          z: 20,
          tooltip: { show: false },
          silent: true,
        }
      })
      .filter(Boolean)

    const xName = xOpt.asPercent ? `${xOpt.label} (%)` : xOpt.label
    const yName = yOpt.asPercent ? `${yOpt.label} (%)` : yOpt.label

    return {
      animationDuration: 400,
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as {
            seriesType?: string
            data?: { point?: BubblePoint; name?: string }
          }
          if (p.seriesType !== 'scatter' || !p.data?.point) return ''
          const pt = p.data.point
          return [
            `<strong>${pt.name}</strong>`,
            `${pt.label}`,
            `Family: ${pt.family}`,
            `${xOpt.label}: ${formatAxisValue(pt, xAxisKey)}`,
            `${yOpt.label}: ${formatAxisValue(pt, yAxisKey)}`,
            `RCA F1: ${formatPct(pt.rca)}`,
            `Cases: ${pt.cases}`,
            `Success: ${formatPct(pt.success_rate)}`,
            pendingFrom
              ? pendingFrom === pt.id
                ? '<em>Click another point to draw comparison arrow</em>'
                : '<em>Click to compare against selection</em>'
              : '<em>Click to start a pair comparison</em>',
          ].join('<br/>')
        },
      },
      legend: {
        data: families,
        top: 0,
      },
      visualMap: [
        {
          type: 'continuous',
          dimension: 2,
          min: extents.minR * 100,
          max: Math.max(extents.maxR * 100, extents.minR * 100 + 1),
          calculable: false,
          orient: 'vertical',
          right: 4,
          top: 'middle',
          text: ['RCA%', ''],
          textGap: 8,
          itemHeight: 120,
          inRange: {
            colorAlpha: [0.3, 1],
          },
          seriesIndex: families.map((_, i) => i),
          formatter: (v: unknown) => `${Number(v).toFixed(0)}`,
        },
      ],
      grid: { left: 64, right: 72, top: 48, bottom: 52 },
      xAxis: {
        name: xName,
        nameLocation: 'middle',
        nameGap: 30,
        min: xRange.min,
        max: xRange.max,
        scale: !xOpt.asPercent,
        axisLabel: { formatter: '{value}' },
        splitLine: { lineStyle: { type: 'dashed', opacity: 0.45 } },
      },
      yAxis: {
        name: yName,
        nameLocation: 'middle',
        nameGap: 44,
        min: yRange.min,
        max: yRange.max,
        scale: !yOpt.asPercent,
        axisLabel: { formatter: '{value}' },
        splitLine: { lineStyle: { type: 'dashed', opacity: 0.45 } },
      },
      series: [
        ...series.map((s) => ({
          ...s,
          data: s.data.map((d) => ({
            ...d,
            itemStyle: {
              color: familyColor(s.name),
              opacity: rcaOpacity(d.point.rca, extents.minR, extents.maxR),
              borderColor:
                d.id === pendingFrom || d.id === focusId ? '#083f32' : '#fff',
              borderWidth: d.id === pendingFrom || d.id === focusId ? 3 : 1.5,
              borderType:
                d.id === pendingFrom ? ('dashed' as const) : ('solid' as const),
            },
          })),
        })),
        ...(arrowSeries as EChartsOption['series'] as object[]),
      ],
    }
  }, [
    points,
    pairs,
    byId,
    extents,
    pendingFrom,
    focusId,
    xAxisKey,
    yAxisKey,
  ])

  const focusPoint = focusId ? byId.get(focusId) : null
  const focusPeers = useMemo(() => {
    if (!focusPoint) return []
    return points
      .filter((p) => p.id !== focusPoint.id)
      .sort((a, b) => b.rca - a.rca)
  }, [focusPoint, points])

  const rcaBarOption = useMemo((): EChartsOption => {
    const selected = focusPoint
      ? [focusPoint, ...focusPeers.slice(0, 4)]
      : points.slice().sort((a, b) => b.rca - a.rca).slice(0, 6)
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 48, right: 16, top: 24, bottom: 64 },
      xAxis: {
        type: 'category',
        data: selected.map((p) => p.label),
        axisLabel: { rotate: 28, fontSize: 10 },
      },
      yAxis: { type: 'value', min: 0, max: 1, name: 'RCA F1' },
      series: [
        {
          type: 'bar',
          data: selected.map((p) => ({
            value: p.rca,
            itemStyle: { color: familyColor(p.family) },
          })),
          barMaxWidth: 42,
          label: {
            show: true,
            position: 'top',
            formatter: (p: unknown) => {
              const v = (p as { value: number }).value
              return v.toFixed(2)
            },
          },
        },
      ],
    }
  }, [focusPoint, focusPeers, points])

  if (loading) return <p className="status">Loading insights…</p>
  if (error) return <p className="status status--error">{error}</p>

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>NIKA Performance</h1>
          <p className="lede">
            Pick X/Y metrics below. Size = cases, color = family, opacity = RCA.
            Click two bubbles to compare.
          </p>
        </div>
      </div>

      <section className="insights-controls">
        <div className="insights-controls__row">
          <label>
            X axis
            <select
              value={xAxisKey}
              onChange={(e) => setXAxisKey(e.target.value as BubbleAxisKey)}
            >
              {BUBBLE_AXIS_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={swapAxes}
            title="Swap X and Y"
            aria-label="Swap X and Y axes"
          >
            ⇄
          </button>
          <label>
            Y axis
            <select
              value={yAxisKey}
              onChange={(e) => setYAxisKey(e.target.value as BubbleAxisKey)}
            >
              {BUBBLE_AXIS_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Next arrow label
            <input
              type="text"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="e.g. LLM Model +++ / Skills --"
            />
          </label>
          <label>
            Arrow color
            <select
              value={draftColor}
              onChange={(e) => setDraftColor(e.target.value)}
            >
              <option value="#0e7490">Cyan (gain)</option>
              <option value="#ea580c">Orange (arch)</option>
              <option value="#1d4ed8">Blue</option>
              <option value="#7c3aed">Violet</option>
              <option value="#ca8a04">Gold</option>
              <option value="#0b1220">Ink (trade-off)</option>
            </select>
          </label>
          <div className="insights-controls__status">
            {pendingFrom ? (
              <>
                Selected{' '}
                <strong>{byId.get(pendingFrom)?.label || pendingFrom}</strong> —
                click a second point
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setPendingFrom(null)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <span className="muted">
                Click a bubble, then another, to draw a comparison arrow.
              </span>
            )}
          </div>
          {pairs.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setPairs([])}
            >
              Clear arrows
            </button>
          )}
        </div>
      </section>

      <div className="insights-layout">
        <div className="insights-chart">
          <ChartPanel
            title="NIKA Performance"
            option={bubbleOption}
            filename="nika-performance-bubbles"
            height={560}
            empty={!points.length}
            zoomable
            onEvents={{
              click: (params: unknown) => {
                const p = params as {
                  seriesType?: string
                  data?: { id?: string }
                }
                if (p.seriesType === 'scatter' && p.data?.id) {
                  onBubbleClick(p.data.id)
                }
              },
            }}
          />
        </div>

        <aside className="insights-side">
          <ChartPanel
            title={focusPoint ? `RCA near ${focusPoint.label}` : 'RCA F1 overview'}
            option={rcaBarOption}
            filename="nika-performance-rca"
            height={280}
            empty={!points.length}
            zoomable={false}
          />

          <section className="pairwise insights-pairs">
            <h2>Pair comparisons</h2>
            {pairs.length === 0 ? (
              <p className="muted">No arrows yet.</p>
            ) : (
              <ul className="insights-pair-list">
                {pairs.map((pair) => {
                  const a = byId.get(pair.fromId)
                  const b = byId.get(pair.toId)
                  if (!a || !b) return null
                  return (
                    <li key={pair.id} className="insights-pair-card">
                      <div
                        className="insights-pair-card__swatch"
                        style={{ background: pair.color }}
                      />
                      <div className="insights-pair-card__body">
                        <input
                          className="insights-pair-card__label"
                          value={pair.label}
                          onChange={(e) =>
                            updatePairLabel(pair.id, e.target.value)
                          }
                        />
                        <p>
                          <strong>{a.label}</strong> → <strong>{b.label}</strong>
                        </p>
                        <p className="muted">
                          {bubbleAxisOption(xAxisKey).label}{' '}
                          {formatAxisDelta(a, b, xAxisKey)} ·{' '}
                          {bubbleAxisOption(yAxisKey).label}{' '}
                          {formatAxisDelta(a, b, yAxisKey)} · RCA{' '}
                          {formatDeltaPp(a.rca, b.rca)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => removePair(pair.id)}
                      >
                        Remove
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="insights-legend-card">
            <h2>Encodings</h2>
            <ul>
              <li>
                <strong>X / Y</strong> — {bubbleAxisOption(xAxisKey).label} /{' '}
                {bubbleAxisOption(yAxisKey).label}
              </li>
              <li>
                <strong>Size</strong> — submitted cases ({extents.minC}–
                {extents.maxC})
              </li>
              <li>
                <strong>Color</strong> — model family
              </li>
              <li>
                <strong>Opacity</strong> — RCA F1 (darker = higher)
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
