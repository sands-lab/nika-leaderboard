import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { EChartsType } from 'echarts'
import {
  CHART_AXIS_NAME,
  CHART_FOCUS,
  CHART_LINE,
  CHART_MUTED,
  CHART_RAISED,
  CHART_TOOLTIP,
} from '../lib/chartTheme'
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
  /** Show zoom sliders for both axes (bottom for x, right for y). */
  zoomSlider?: boolean
  onEvents?: Record<string, (params: unknown) => void>
  /** Overlay rendered above the chart canvas (same size box). */
  overlay?: ReactNode
  onChartReady?: (chart: EChartsType | null) => void
}


function withDarkTheme(option: EChartsOption): EChartsOption {
  const existingText =
    typeof option.textStyle === 'object' && !Array.isArray(option.textStyle)
      ? option.textStyle
      : {}
  const existingLegend =
    option.legend && typeof option.legend === 'object' && !Array.isArray(option.legend)
      ? option.legend
      : null

  // A radar's axis names and grid do not inherit textStyle, so ECharts' light
  // defaults (#54555a names, pale grey bands) survive onto the dark panel.
  const existingRadar =
    option.radar && typeof option.radar === 'object' && !Array.isArray(option.radar)
      ? option.radar
      : null

  const existingTooltip =
    option.tooltip && typeof option.tooltip === 'object' && !Array.isArray(option.tooltip)
      ? option.tooltip
      : null

  return {
    ...option,
    backgroundColor: option.backgroundColor ?? 'transparent',
    tooltip: existingTooltip
      ? { ...CHART_TOOLTIP, ...existingTooltip }
      : option.tooltip,
    textStyle: {
      color: CHART_MUTED,
      ...existingText,
    },
    radar: existingRadar
      ? {
          axisName: { color: CHART_AXIS_NAME, fontSize: 12 },
          axisLine: { lineStyle: { color: CHART_LINE } },
          splitLine: { lineStyle: { color: CHART_LINE } },
          splitArea: {
            areaStyle: {
              color: ['rgba(255, 255, 255, 0.02)', 'rgba(255, 255, 255, 0.045)'],
            },
          },
          ...existingRadar,
        }
      : option.radar,
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
      color: CHART_AXIS_NAME,
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

/** Zoom sliders' geometry, shared so the plot and axis names can clear them. */
const SLIDER_GAP = 8
const SLIDER_SIZE = 16

/**
 * Every legend is laid out the same way: a horizontal block across the top of
 * the canvas that wraps onto as many rows as the entries need. The canvas grows
 * by the block's height, so a long legend never takes room from the plot and
 * never lands on an axis, a slider or a label. The previous mix - pages of a
 * scrolling legend in one chart, a vertical column in another, a bottom row
 * colliding with rotated labels in a third - is what this replaces.
 */
const LEGEND_FONT = 'Inter, system-ui, sans-serif'
const LEGEND_FONT_SIZE = 12
const LEGEND_ICON_W = 14
const LEGEND_ICON_H = 10
const LEGEND_ICON_GAP = 5
const LEGEND_ITEM_GAP = 14
/** ECharts spaces wrapped rows by the item gap too. */
const LEGEND_ROW_GAP = LEGEND_ITEM_GAP
/** Fixed via textStyle.lineHeight, so a row is this tall whatever its icon. */
const LEGEND_ROW_H = 14
const LEGEND_TOP = 6
/** ECharts' default legend padding, included in the box it reports. */
const LEGEND_PADDING = 5
/** Width the toolbox's icons take in the top-right corner. */
const TOOLBOX_RESERVE = 96

let measureCtx: CanvasRenderingContext2D | null = null
function textWidth(text: string): number {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d')
  }
  if (!measureCtx) return text.length * 7
  measureCtx.font = `${LEGEND_FONT_SIZE}px ${LEGEND_FONT}`
  return measureCtx.measureText(text).width
}

function legendNames(option: EChartsOption): string[] {
  const legend = option.legend
  if (legend && !Array.isArray(legend) && Array.isArray(legend.data)) {
    return legend.data.map((d) =>
      typeof d === 'string' ? d : String((d as { name?: unknown }).name ?? ''),
    )
  }
  const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : []
  return series.map((s) => String((s as { name?: unknown }).name ?? '')).filter(Boolean)
}

/** Rows a wrapping horizontal legend needs at this width (ECharts' box layout). */
function legendRows(names: string[], available: number): number {
  let rows = 1
  let x = 0
  for (const name of names) {
    // A couple of pixels of slack per item: canvas and ECharts round differently.
    const w = LEGEND_ICON_W + LEGEND_ICON_GAP + textWidth(name) + 2
    if (x > 0 && x + w > available) {
      rows += 1
      x = 0
    }
    x += w + LEGEND_ITEM_GAP
  }
  return rows
}

interface Layout {
  option: EChartsOption
  /** Canvas height: the requested plot height plus the legend block. */
  height: number
  /** Legend rows' height as laid out, to compare with what renders. */
  legendHeight: number
}

function layoutChart(
  option: EChartsOption,
  width: number,
  height: number,
  zoomable: boolean,
  zoomSlider: boolean,
  /** The legend's rendered height, once known; otherwise it is estimated. */
  measuredLegend?: number,
): Layout {
  const hasCartesian = Boolean(option.xAxis || option.yAxis)
  const toolbox = zoomable && hasCartesian
  const legend = option.legend && !Array.isArray(option.legend) ? option.legend : null
  const names = legend ? legendNames(option) : []
  const showLegend = legend != null && legend.show !== false && names.length > 0

  const left = 12
  const right = toolbox ? TOOLBOX_RESERVE : 12
  const legendWidth = Math.max(120, width - left - right)
  const rows = showLegend ? legendRows(names, legendWidth) : 0
  const legendHeight = showLegend
    ? (measuredLegend ??
      rows * LEGEND_ROW_H + (rows - 1) * LEGEND_ROW_GAP + 2 * LEGEND_PADDING)
    : 0
  const legendBlock = showLegend ? LEGEND_TOP + legendHeight + 12 : 0
  const ySlider = toolbox && zoomSlider

  const out: EChartsOption = { ...option }
  if (showLegend) {
    // The panel owns legend placement; any position a chart set is dropped.
    const rest = { ...legend } as Record<string, unknown>
    for (const key of ['top', 'bottom', 'left', 'right', 'width', 'height', 'orient', 'type']) {
      delete rest[key]
    }
    out.legend = {
      ...rest,
      type: 'plain',
      orient: 'horizontal',
      left,
      // A set width, not `right`: ECharts wraps the legend at its width and
      // ignores `right` for that, which ran the first row under the toolbox.
      width: legendWidth,
      top: LEGEND_TOP,
      itemWidth: LEGEND_ICON_W,
      itemHeight: LEGEND_ICON_H,
      itemGap: LEGEND_ITEM_GAP,
      textStyle: {
        color: CHART_MUTED,
        fontSize: LEGEND_FONT_SIZE,
        fontFamily: LEGEND_FONT,
        lineHeight: LEGEND_ROW_H,
        ...(typeof legend.textStyle === 'object' ? legend.textStyle : {}),
      },
    }
  }

  const grid = typeof option.grid === 'object' && !Array.isArray(option.grid) ? option.grid : null
  if (hasCartesian) {
    const top = typeof grid?.top === 'number' ? grid.top : 36
    const bottom = typeof grid?.bottom === 'number' ? grid.bottom : 48
    const gridRight = typeof grid?.right === 'number' ? grid.right : 28
    out.grid = {
      ...grid,
      top: top + legendBlock,
      bottom: toolbox && zoomSlider ? bottom + SLIDER_SIZE + SLIDER_GAP : bottom,
      right: ySlider ? gridRight + SLIDER_SIZE + SLIDER_GAP : gridRight,
    }
  }

  // A radar or polar plot is centred in what is left below the legend, sized
  // to fit it, rather than in the whole canvas where the legend would cover it.
  const plotCentre: [string, number] = ['50%', legendBlock + height / 2]
  const fit = Math.max(60, Math.min(width / 2, height / 2) - 44)
  const radar = option.radar && !Array.isArray(option.radar) ? option.radar : null
  if (radar) out.radar = { ...radar, center: plotCentre, radius: fit }
  const polar = option.polar && !Array.isArray(option.polar) ? option.polar : null
  if (polar) out.polar = { ...polar, center: plotCentre, radius: [fit * 0.26, fit] }

  if (toolbox) {
    const existingToolbox =
      option.toolbox && typeof option.toolbox === 'object' && !Array.isArray(option.toolbox)
        ? option.toolbox
        : {}
    const existingFeature =
      existingToolbox.feature && typeof existingToolbox.feature === 'object'
        ? existingToolbox.feature
        : {}
    const existingZoom = Array.isArray(option.dataZoom)
      ? option.dataZoom
      : option.dataZoom
        ? [option.dataZoom]
        : []
    // Both axes zoom alike: the wheel, a drag, the box tool and the sliders.
    // A small throttle keeps wheel zoom continuous instead of stepping every
    // 100 ms (ECharts' default).
    const dataZoom: object[] = [
      ...existingZoom,
      { type: 'inside', xAxisIndex: 0, filterMode: 'none', throttle: 16 },
      { type: 'inside', yAxisIndex: 0, filterMode: 'none', throttle: 16 },
    ]
    if (zoomSlider) {
      const slider = {
        type: 'slider',
        filterMode: 'none',
        throttle: 16,
        showDetail: false,
        brushSelect: false,
        // A quiet track: the slider is a control, not data.
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderColor: CHART_LINE,
        borderRadius: 6,
        fillerColor: 'rgba(34, 211, 238, 0.07)',
        handleStyle: { color: CHART_RAISED, borderColor: CHART_MUTED },
        emphasis: { handleStyle: { borderColor: CHART_FOCUS } },
        moveHandleSize: 0,
        showDataShadow: false,
      }
      dataZoom.push(
        { ...slider, xAxisIndex: 0, height: SLIDER_SIZE, bottom: SLIDER_GAP },
        {
          ...slider,
          yAxisIndex: 0,
          width: SLIDER_SIZE,
          right: SLIDER_GAP,
          top: legendBlock + (typeof grid?.top === 'number' ? grid.top : 36),
          bottom: (typeof grid?.bottom === 'number' ? grid.bottom : 48) + SLIDER_SIZE + SLIDER_GAP,
        },
      )
    }
    out.toolbox = {
      ...existingToolbox,
      right: 12,
      top: 2,
      itemSize: 14,
      iconStyle: {
        borderColor: CHART_MUTED,
        ...(typeof existingToolbox.iconStyle === 'object' ? existingToolbox.iconStyle : {}),
      },
      feature: {
        ...existingFeature,
        dataZoom: { title: { zoom: 'Box zoom (both axes)', back: 'Undo zoom' } },
        restore: { title: 'Reset' },
      },
    }
    out.dataZoom = dataZoom as EChartsOption['dataZoom']
    // Zoom redraws every mark; easing each redraw is what made it lag behind
    // the wheel.
    out.animationDurationUpdate = 0
  }

  const tooltip =
    out.tooltip && typeof out.tooltip === 'object' && !Array.isArray(out.tooltip) ? out.tooltip : null
  if (tooltip) out.tooltip = { confine: true, ...tooltip }

  return { option: out, height: height + legendBlock, legendHeight }
}

function useWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0)
  // Layout effect: the first paint already has the real width, so the legend
  // is never laid out for a zero-width box and the page does not jump.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => {
      // Whole pixels only, so sub-pixel jitter does not re-layout the chart.
      setWidth(Math.round(entry.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

function ChartCanvas({
  option,
  height,
  chartRef,
  zoomable,
  zoomSlider,
  onEvents,
  onChartReady,
  overlay,
}: {
  option: EChartsOption
  height: number
  chartRef: RefObject<ReactECharts>
  zoomable: boolean
  zoomSlider: boolean
  onEvents?: Record<string, (params: unknown) => void>
  onChartReady?: (chart: EChartsType | null) => void
  overlay?: ReactNode
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const width = useWidth(hostRef)

  // The estimate can be off by a row (fonts differ by platform), so after
  // each draw the legend's real height is read back and, if it differs, the
  // layout is redone with it. Keyed by width and entries so it never goes stale.
  const legendKey = `${width}|${legendNames(option).join('\u0000')}`
  const [measured, setMeasured] = useState<{ key: string; height: number } | null>(null)
  const layout = useMemo(
    () =>
      layoutChart(
        withDarkAxes(withDarkTheme(option)),
        width,
        height,
        zoomable,
        zoomSlider,
        measured?.key === legendKey ? measured.height : undefined,
      ),
    [option, width, height, zoomable, zoomSlider, measured, legendKey],
  )

  const readBack = (chart: EChartsType) => {
    if (!layout.legendHeight || chart.isDisposed()) return
    // Not in ECharts' public typings, but stable across v5 and v6.
    const inst = chart as unknown as {
      getModel: () => { getComponent: (t: string) => unknown }
      getViewOfComponentModel: (
        m: unknown,
      ) => { group: { getBoundingRect: () => { height: number } } } | undefined
    }
    const model = inst.getModel().getComponent('legend')
    const view = model ? inst.getViewOfComponentModel(model) : undefined
    const h = view ? Math.ceil(view.group.getBoundingRect().height) : 0
    if (h > 0 && Math.abs(h - layout.legendHeight) > 2) {
      setMeasured({ key: legendKey, height: h })
    }
  }

  // echarts-for-react unbinds and rebinds every handler whenever the onEvents
  // object changes identity, which an inline handler map does on every render.
  // It gets one stable map per set of event names, forwarding to the latest
  // handlers; the library binds it to each new instance itself, which is also
  // how the legend read-back stays attached.
  const latest = useRef({ onEvents, readBack })
  useEffect(() => {
    latest.current = { onEvents, readBack }
  })
  const eventNames = Object.keys(onEvents ?? {}).filter((n) => n !== 'finished').sort().join(',')
  const stableEvents = useMemo(() => {
    const map: Record<string, (p: unknown, chart: EChartsType) => void> = {
      finished: (p, chart) => {
        latest.current.onEvents?.finished?.(p)
        latest.current.readBack(chart)
      },
    }
    for (const name of eventNames.split(',').filter(Boolean)) {
      map[name] = (p) => latest.current.onEvents?.[name]?.(p)
    }
    return map
  }, [eventNames])

  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance() ?? null
    onChartReady?.(chart)
    return () => onChartReady?.(null)
  }, [chartRef, onChartReady, layout])

  return (
    <div ref={hostRef} className="chart-panel__stage" style={{ height: layout.height }}>
      {width > 0 && (
        <ReactECharts
          // echarts-for-react ref typings disagree with React 18 RefObject<T | null>
          ref={chartRef as never}
          option={layout.option}
          // Canvas keeps zoom and pan smooth; the PDF export re-renders as SVG.
          opts={{ renderer: 'canvas' }}
          style={{ height: layout.height, width: '100%' }}
          notMerge
          lazyUpdate
          onEvents={stableEvents}
          onChartReady={(instance) => onChartReady?.(instance)}
        />
      )}
      {overlay}
    </div>
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
            <ChartCanvas
              chartRef={chartRef}
              option={option}
              height={height}
              zoomable={zoomable}
              zoomSlider={zoomSlider}
              onEvents={onEvents}
              onChartReady={onChartReady}
              overlay={overlay}
            />
          )
        )}
        {!empty && zoomable && (
          <p className="chart-panel__hint muted">
            Scroll to zoom, drag to pan, or box-zoom from the toolbox; both axes
            zoom. Reset restores the full view.
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
