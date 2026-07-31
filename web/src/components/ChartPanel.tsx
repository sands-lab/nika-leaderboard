import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { EChartsType } from 'echarts'
import { downloadPdf, downloadPng } from '../lib/export'

interface ChartPanelProps {
  title: string
  /** Short caption under the title explaining what the chart shows. */
  description?: string
  option: EChartsOption
  filename: string
  height?: number
  empty?: boolean
  emptyMessage?: string
  /** Enable inside dataZoom / toolbox zoom when the option has cartesian axes. */
  zoomable?: boolean
  /** Show the bottom dataZoom slider (can collide with rotated x-axis labels). */
  zoomSlider?: boolean
  onEvents?: Record<string, (params: unknown) => void>
  /** Overlay rendered above the chart canvas (same size box). */
  overlay?: ReactNode
  onChartReady?: (chart: EChartsType | null) => void
}

const CHART_MUTED = '#8b9cb6'
const CHART_LINE = 'rgba(255, 255, 255, 0.1)'

function withDarkTheme(option: EChartsOption): EChartsOption {
  const existingText =
    typeof option.textStyle === 'object' && !Array.isArray(option.textStyle)
      ? option.textStyle
      : {}
  const existingLegend =
    option.legend && typeof option.legend === 'object' && !Array.isArray(option.legend)
      ? option.legend
      : null

  return {
    ...option,
    backgroundColor: option.backgroundColor ?? 'transparent',
    textStyle: {
      color: CHART_MUTED,
      ...existingText,
    },
    legend: existingLegend
      ? {
          ...existingLegend,
          textStyle: {
            color: CHART_MUTED,
            ...(typeof existingLegend.textStyle === 'object'
              ? existingLegend.textStyle
              : {}),
          },
        }
      : option.legend,
  }
}

function patchAxis(axis: unknown): unknown {
  if (!axis) return axis
  if (Array.isArray(axis)) return axis.map((item) => patchAxis(item))
  if (typeof axis !== 'object') return axis
  const a = axis as Record<string, unknown>
  const axisLine =
    typeof a.axisLine === 'object' && a.axisLine ? (a.axisLine as Record<string, unknown>) : {}
  const axisLabel =
    typeof a.axisLabel === 'object' && a.axisLabel ? (a.axisLabel as Record<string, unknown>) : {}
  const splitLine =
    typeof a.splitLine === 'object' && a.splitLine ? (a.splitLine as Record<string, unknown>) : {}
  const nameTextStyle =
    typeof a.nameTextStyle === 'object' && a.nameTextStyle
      ? (a.nameTextStyle as Record<string, unknown>)
      : {}
  const axisLineStyle =
    typeof axisLine.lineStyle === 'object' && axisLine.lineStyle
      ? (axisLine.lineStyle as Record<string, unknown>)
      : {}
  const splitLineStyle =
    typeof splitLine.lineStyle === 'object' && splitLine.lineStyle
      ? (splitLine.lineStyle as Record<string, unknown>)
      : {}

  return {
    ...a,
    axisLine: {
      ...axisLine,
      lineStyle: { color: CHART_LINE, ...axisLineStyle },
    },
    axisLabel: {
      color: CHART_MUTED,
      ...axisLabel,
    },
    splitLine: {
      ...splitLine,
      lineStyle: { color: CHART_LINE, ...splitLineStyle },
    },
    nameTextStyle: {
      color: CHART_MUTED,
      ...nameTextStyle,
    },
  }
}

function withDarkAxes(option: EChartsOption): EChartsOption {
  return {
    ...option,
    xAxis: patchAxis(option.xAxis) as EChartsOption['xAxis'],
    yAxis: patchAxis(option.yAxis) as EChartsOption['yAxis'],
    radiusAxis: patchAxis(option.radiusAxis) as EChartsOption['radiusAxis'],
    angleAxis: patchAxis(option.angleAxis) as EChartsOption['angleAxis'],
  }
}

function withInteractions(
  option: EChartsOption,
  zoomable: boolean,
  zoomSlider: boolean,
): EChartsOption {
  if (!zoomable) return option
  const hasCartesian = Boolean(
    option.xAxis || option.yAxis || (option as { grid?: unknown }).grid,
  )
  if (!hasCartesian) return option

  const existingToolbox =
    option.toolbox && typeof option.toolbox === 'object' && !Array.isArray(option.toolbox)
      ? option.toolbox
      : {}
  const existingFeature =
    existingToolbox.feature && typeof existingToolbox.feature === 'object'
      ? existingToolbox.feature
      : {}

  const existingGrid =
    typeof option.grid === 'object' && !Array.isArray(option.grid) ? option.grid : {}
  const existingBottom =
    typeof existingGrid.bottom === 'number' ? existingGrid.bottom : 48

  const dataZoom: object[] = [
    ...(Array.isArray(option.dataZoom)
      ? option.dataZoom
      : option.dataZoom
        ? [option.dataZoom]
        : []),
    { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
    { type: 'inside', yAxisIndex: 0, filterMode: 'none' },
  ]
  if (zoomSlider) {
    dataZoom.push({
      type: 'slider',
      xAxisIndex: 0,
      height: 18,
      bottom: 8,
      filterMode: 'none',
    })
  }

  return {
    ...option,
    legend: option.legend
      ? Array.isArray(option.legend)
        ? option.legend
        : {
            ...option.legend,
            // Only pin legend to bottom when the option didn't already place it.
            ...(!('top' in option.legend) &&
            !('bottom' in option.legend && option.legend.bottom != null)
              ? { bottom: 28 }
              : {}),
          }
      : option.legend,
    toolbox: {
      ...existingToolbox,
      right: 12,
      top: 0,
      iconStyle: {
        borderColor: CHART_MUTED,
        ...(typeof existingToolbox.iconStyle === 'object'
          ? existingToolbox.iconStyle
          : {}),
      },
      feature: {
        ...existingFeature,
        dataZoom: { yAxisIndex: 'none', title: { zoom: 'Zoom', back: 'Reset zoom' } },
        restore: { title: 'Reset' },
      },
    },
    dataZoom,
    grid: {
      ...existingGrid,
      // Keep room for axis labels; only bump further when a bottom slider is shown.
      bottom: zoomSlider ? Math.max(existingBottom, 96) : existingBottom,
    },
  }
}

function ChartCanvas({
  option,
  height,
  chartRef,
  zoomable,
  zoomSlider,
  onEvents,
  onChartReady,
}: {
  option: EChartsOption
  height: number
  chartRef: RefObject<ReactECharts>
  zoomable: boolean
  zoomSlider: boolean
  onEvents?: Record<string, (params: unknown) => void>
  onChartReady?: (chart: EChartsType | null) => void
}) {
  const merged = useMemo(
    () => withInteractions(withDarkAxes(withDarkTheme(option)), zoomable, zoomSlider),
    [option, zoomable, zoomSlider],
  )

  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance() ?? null
    onChartReady?.(chart)
    return () => onChartReady?.(null)
  }, [chartRef, onChartReady, merged])

  return (
    <ReactECharts
      // echarts-for-react ref typings disagree with React 18 RefObject<T | null>
      ref={chartRef as never}
      option={merged}
      opts={{ renderer: 'svg' }}
      style={{ height, width: '100%' }}
      notMerge
      lazyUpdate
      onEvents={onEvents}
      onChartReady={(instance) => onChartReady?.(instance)}
    />
  )
}

export function ChartPanel({
  title,
  description,
  option,
  filename,
  height = 360,
  empty = false,
  emptyMessage = 'Select entries to plot.',
  zoomable = true,
  zoomSlider = true,
  onEvents,
  overlay,
  onChartReady,
}: ChartPanelProps) {
  const chartRef = useRef<ReactECharts>(null)
  const modalChartRef = useRef<ReactECharts>(null)
  const [ready, setReady] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [expanded])

  const getChart = (preferModal = false): EChartsType | undefined => {
    if (preferModal && expanded) {
      return modalChartRef.current?.getEchartsInstance()
    }
    return (
      (expanded ? modalChartRef.current : chartRef.current)?.getEchartsInstance() ||
      chartRef.current?.getEchartsInstance()
    )
  }

  const onPdf = async () => {
    setExporting(true)
    try {
      await downloadPdf(getChart(true), filename)
    } finally {
      setExporting(false)
    }
  }

  const actions = (
    <div className="chart-panel__actions">
      <button
        type="button"
        className="btn btn--ghost"
        disabled={empty}
        onClick={() => setExpanded(true)}
        title="Enlarge chart"
      >
        Enlarge
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={empty}
        onClick={() => downloadPng(getChart(true), filename)}
      >
        PNG
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={empty || exporting}
        onClick={() => void onPdf()}
        title="Vector PDF (SVG → PDF)"
      >
        {exporting ? 'PDF…' : 'PDF'}
      </button>
    </div>
  )

  return (
    <>
      <section className="chart-panel">
        <header className="chart-panel__header">
          <div className="chart-panel__heading">
            <h3>{title}</h3>
            {description && (
              <p className="chart-panel__description muted">{description}</p>
            )}
          </div>
          {actions}
        </header>
        {empty ? (
          <div className="chart-panel__empty" style={{ height }}>
            {emptyMessage}
          </div>
        ) : (
          ready && (
            <div className="chart-panel__stage" style={{ height }}>
              <ChartCanvas
                chartRef={chartRef}
                option={option}
                height={height}
                zoomable={zoomable}
                zoomSlider={zoomSlider}
                onEvents={onEvents}
                onChartReady={onChartReady}
              />
              {overlay}
            </div>
          )
        )}
        {!empty && zoomable && (
          <p className="chart-panel__hint muted">
            {zoomSlider
              ? 'Scroll / drag to zoom; use toolbox Reset, or Enlarge for a larger view.'
              : 'Scroll / drag to zoom (toolbox Zoom / Reset); Enlarge for a larger view.'}
          </p>
        )}
      </section>

      {expanded && !empty && (
        <div
          className="chart-modal"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => {
            if (e.target === e.currentTarget) setExpanded(false)
          }}
        >
          <div className="chart-modal__panel">
            <header className="chart-panel__header">
              <h3>{title}</h3>
              <div className="chart-panel__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => downloadPng(getChart(true), filename)}
                >
                  PNG
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={exporting}
                  onClick={() => void onPdf()}
                >
                  {exporting ? 'PDF…' : 'PDF'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setExpanded(false)}
                >
                  Close
                </button>
              </div>
            </header>
            <ChartCanvas
              chartRef={modalChartRef}
              option={option}
              height={Math.max(520, Math.round(window.innerHeight * 0.72))}
              zoomable={zoomable}
              zoomSlider={zoomSlider}
              onEvents={onEvents}
            />
          </div>
        </div>
      )}
    </>
  )
}
