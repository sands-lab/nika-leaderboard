import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import type { EChartsType } from 'echarts'
import { BubbleGainOverlays } from '../components/BubbleGainOverlays'
import { ChartPanel } from '../components/ChartPanel'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import {
  type BubbleAxisKey,
  type BubbleEncodeKey,
  type BubblePoint,
  type PairAnnotation,
  BUBBLE_AXIS_OPTIONS,
  BUBBLE_OPACITY_OPTIONS,
  BUBBLE_SIZE_OPTIONS,
  axisPlotValue,
  axisRange,
  bubbleAxisOption,
  encodeExtents,
  encodeLabel,
  encodeRawValue,
  familyColor,
  formatAxisDelta,
  formatAxisTick,
  formatAxisValue,
  formatDeltaPp,
  inferModelFamily,
  makePairId,
  shortLabel,
} from '../lib/insights'
import type { SubmissionSummary } from '../lib/types'

const ARROW_COLORS = ['#00d4ff', '#f97316', '#3b82f6', '#8b5cf6', '#eab308', '#e2e8f0']

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

function sizeScale(value: number, minV: number, maxV: number): number {
  if (maxV <= minV) return 28
  const t = (value - minV) / (maxV - minV)
  return 16 + t * 36
}

function metricOpacity(value: number, minV: number, maxV: number): number {
  if (maxV <= minV) return 0.75
  const t = (value - minV) / (maxV - minV)
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
  const [sizeKey, setSizeKey] = useState<BubbleEncodeKey>('cases')
  const [opacityKey, setOpacityKey] = useState<BubbleEncodeKey>('rca')
  const [chart, setChart] = useState<EChartsType | null>(null)
  const onChartReady = useCallback((instance: EChartsType | null) => {
    setChart(instance)
  }, [])

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

  const sizeExtents = useMemo(
    () => encodeExtents(points, sizeKey),
    [points, sizeKey],
  )
  const opacityExtents = useMemo(
    () => encodeExtents(points, opacityKey),
    [points, opacityKey],
  )

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

  const hidePairLabel = (id: string) => {
    setPairs((prev) =>
      prev.map((p) => (p.id === id ? { ...p, labelHidden: true } : p)),
    )
  }

  const showPairLabel = (id: string) => {
    setPairs((prev) =>
      prev.map((p) => (p.id === id ? { ...p, labelHidden: false } : p)),
    )
  }

  const setPairOffset = (id: string, labelOffset: { x: number; y: number }) => {
    setPairs((prev) =>
      prev.map((p) => (p.id === id ? { ...p, labelOffset } : p)),
    )
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
        data: subset.map((p) => {
          const sizeVal = encodeRawValue(p, sizeKey)
          const opacityVal = encodeRawValue(p, opacityKey)
          return {
            value: [
              axisPlotValue(p, xAxisKey),
              axisPlotValue(p, yAxisKey),
              opacityVal,
              sizeVal,
            ],
            id: p.id,
            name: p.label,
            point: p,
            sizeVal,
            opacityVal,
          }
        }),
        symbolSize: (val: unknown) => {
          if (sizeKey === 'fixed') return 28
          const v = val as number[]
          return sizeScale(v[3] ?? 0, sizeExtents.min, sizeExtents.max)
        },
        itemStyle: {
          color: familyColor(family),
          opacity: 0.85,
          borderColor: '#e2e8f0',
          borderWidth: 1.5,
        },
        label: {
          show: true,
          formatter: (params: unknown) => {
            const p = params as { data: { name: string } }
            return p.data.name
          },
          position: 'right' as const,
          fontSize: 11,
          color: '#e2e8f0',
        },
        emphasis: {
          scale: 1.12,
          itemStyle: { borderColor: '#00d4ff', borderWidth: 2 },
        },
      }
    })

    const arrowData = pairs
      .map((pair) => {
        const a = byId.get(pair.fromId)
        const b = byId.get(pair.toId)
        if (!a || !b) return null
        return {
          coords: [
            [
              axisPlotValue(a, xAxisKey),
              axisPlotValue(a, yAxisKey),
            ],
            [
              axisPlotValue(b, xAxisKey),
              axisPlotValue(b, yAxisKey),
            ],
          ],
          color: pair.color,
        }
      })
      .filter(Boolean) as Array<{
      coords: number[][]
      color: string
    }>

    const xName = xOpt.asPercent ? `${xOpt.label} (%)` : xOpt.label
    const yName = yOpt.asPercent ? `${yOpt.label} (%)` : yOpt.label
    const opacityAsPercent =
      opacityKey !== 'fixed' && bubbleAxisOption(opacityKey as BubbleAxisKey).asPercent

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
            `Size (${encodeLabel(sizeKey)}): ${
              sizeKey === 'fixed'
                ? 'fixed'
                : formatAxisValue(pt, sizeKey as BubbleAxisKey)
            }`,
            `Opacity (${encodeLabel(opacityKey)}): ${
              opacityKey === 'fixed'
                ? 'fixed'
                : formatAxisValue(pt, opacityKey as BubbleAxisKey)
            }`,
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
      visualMap:
        opacityKey === 'fixed'
          ? []
          : [
              {
                type: 'continuous',
                dimension: 2,
                min: opacityExtents.min,
                max: Math.max(
                  opacityExtents.max,
                  opacityExtents.min + (opacityAsPercent ? 0.01 : 1),
                ),
                calculable: false,
                orient: 'vertical',
                right: 4,
                top: 'middle',
                text: [encodeLabel(opacityKey), ''],
                textGap: 8,
                itemHeight: 120,
                inRange: {
                  colorAlpha: [0.3, 1],
                },
                seriesIndex: families.map((_, i) => i),
                formatter: (v: unknown) => {
                  const n = Number(v)
                  if (opacityAsPercent) return `${(n * 100).toFixed(0)}%`
                  if (opacityKey === 'mean_tokens') return `${Math.round(n)}`
                  if (opacityKey === 'mean_steps') return n.toFixed(1)
                  return `${n.toFixed(0)}`
                },
              },
            ],
      grid: { left: 64, right: 88, top: 48, bottom: 52 },
      xAxis: {
        name: xName,
        nameLocation: 'middle',
        nameGap: 30,
        min: xOpt.asPercent ? 0 : xRange.min,
        max: xOpt.asPercent ? 100 : xRange.max,
        interval: xOpt.asPercent ? 20 : undefined,
        scale: !xOpt.asPercent,
        axisLabel: {
          formatter: (v: number) => formatAxisTick(v, xOpt.asPercent),
        },
        splitLine: { lineStyle: { type: 'dashed', opacity: 0.45 } },
      },
      yAxis: {
        name: yName,
        nameLocation: 'middle',
        nameGap: 44,
        min: yOpt.asPercent ? 0 : yRange.min,
        max: yOpt.asPercent ? 100 : yRange.max,
        interval: yOpt.asPercent ? 20 : undefined,
        scale: !yOpt.asPercent,
        axisLabel: {
          formatter: (v: number) => formatAxisTick(v, yOpt.asPercent),
        },
        splitLine: { lineStyle: { type: 'dashed', opacity: 0.45 } },
      },
      series: [
        ...series.map((s) => ({
          ...s,
          data: s.data.map((d) => ({
            ...d,
            itemStyle: {
              color: familyColor(s.name),
              opacity:
                opacityKey === 'fixed'
                  ? 0.85
                  : metricOpacity(
                      d.opacityVal,
                      opacityExtents.min,
                      opacityExtents.max,
                    ),
              borderColor:
                d.id === pendingFrom || d.id === focusId ? '#00d4ff' : '#e2e8f0',
              borderWidth: d.id === pendingFrom || d.id === focusId ? 3 : 1.5,
              borderType:
                d.id === pendingFrom ? ('dashed' as const) : ('solid' as const),
            },
          })),
        })),
        {
          type: 'lines' as const,
          coordinateSystem: 'cartesian2d',
          z: 20,
          silent: true,
          polyline: false,
          symbol: ['circle', 'arrow'],
          symbolSize: [7, 16],
          lineStyle: { width: 2.5, curveness: 0 },
          data: arrowData.map((d) => ({
            coords: d.coords,
            lineStyle: { width: 2.5, color: d.color, opacity: 0.95 },
          })),
          tooltip: { show: false },
        },
      ],
    }
  }, [
    points,
    pairs,
    byId,
    sizeExtents,
    opacityExtents,
    pendingFrom,
    focusId,
    xAxisKey,
    yAxisKey,
    sizeKey,
    opacityKey,
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
            position: 'top' as const,
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
          <h1>Performance Bubbles</h1>
          <p className="lede">
            Pick X/Y, size, and opacity encodings. Color = model family. Click
            two bubbles to compare.
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
            Size
            <select
              value={sizeKey}
              onChange={(e) => setSizeKey(e.target.value as BubbleEncodeKey)}
            >
              {BUBBLE_SIZE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Opacity
            <select
              value={opacityKey}
              onChange={(e) => setOpacityKey(e.target.value as BubbleEncodeKey)}
            >
              {BUBBLE_OPACITY_OPTIONS.map((o) => (
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
              <option value="#00d4ff">Cyan (gain)</option>
              <option value="#f97316">Orange (arch)</option>
              <option value="#3b82f6">Blue</option>
              <option value="#8b5cf6">Violet</option>
              <option value="#eab308">Gold</option>
              <option value="#e2e8f0">Ink (trade-off)</option>
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
            title="Performance Bubbles"
            option={bubbleOption}
            filename="nika-performance-bubbles"
            height={560}
            empty={!points.length}
            zoomable
            zoomSlider={false}
            onChartReady={onChartReady}
            overlay={
              <BubbleGainOverlays
                chart={chart}
                pairs={pairs}
                byId={byId}
                xAxisKey={xAxisKey}
                yAxisKey={yAxisKey}
                onClose={hidePairLabel}
                onOffsetChange={setPairOffset}
              />
            }
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
                      <div className="insights-pair-card__actions">
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() =>
                            pair.labelHidden
                              ? showPairLabel(pair.id)
                              : hidePairLabel(pair.id)
                          }
                        >
                          {pair.labelHidden ? 'Show tag' : 'Hide tag'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => removePair(pair.id)}
                        >
                          Remove
                        </button>
                      </div>
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
                <strong>Size</strong> — {encodeLabel(sizeKey)}
                {sizeKey !== 'fixed'
                  ? ` (${sizeExtents.min.toFixed(2)}–${sizeExtents.max.toFixed(2)})`
                  : ''}
              </li>
              <li>
                <strong>Color</strong> — model family
              </li>
              <li>
                <strong>Opacity</strong> — {encodeLabel(opacityKey)}
                {opacityKey !== 'fixed' ? ' (darker = higher)' : ''}
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
