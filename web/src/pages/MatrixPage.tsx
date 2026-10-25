import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { EChartsOption } from 'echarts'
import { ChartPanel } from '../components/ChartPanel'
import { EntryPicker } from '../components/EntryPicker'
import { aggregateByCase } from '../lib/compare'
import { categoryLabel } from '../lib/confusion'
import { formatPct, formatScore, loadSubmissionDetails } from '../lib/data'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import { compareSortValues } from '../lib/tableSort'
import type { CaseAggregate } from '../lib/compare'
import type { SubmissionDetail } from '../lib/types'
import {
  categoryTickSize,
  CHART_FOCUS,
  CHART_MUTED,
  CHART_SURFACE,
  CHART_TEXT,
  DIVERGING_RAMP,
  divergingColor,
  heatInk,
  measureText,
} from '../lib/chartTheme'

type AggregateMode = 'problem' | 'category' | 'scenario' | 'size'
type MetricMode = 'success' | 'rca'
/**
 * Rows sort by the Average column and columns by the Average row, best or
 * worst first; columns start in the order the entries were selected.
 */
type AverageSort = 'desc' | 'asc'

const METRIC_LABEL: Record<MetricMode, string> = {
  rca: 'Mean RCA F1',
  success: 'Diagnosis submitted (%)',
}

/** What each metric measures, for the control's tooltip and the chart. */
const METRIC_HELP: Record<MetricMode, string> = {
  rca: 'Mean RCA F1: how well the submitted fault types match the injected ones, from 0 to 1, averaged over trials. A trial with no submission scores 0.',
  success:
    'Diagnosis submitted (%): share of trials in which the agent produced a structured answer that could be scored, right or wrong.',
}

const AGGREGATE_LABEL: Record<AggregateMode, string> = {
  problem: 'Failure',
  category: 'Failure domain',
  scenario: 'Network environment',
  size: 'Topology size',
}

/** Sort marks as on the leaderboard's sortable headers. */
const SORT_MARK: Record<AverageSort | 'none', string> = { desc: '▼', asc: '▲', none: '⇅' }

/**
 * The average sits in its own column after an empty spacer, outlined and
 * labelled apart from the entries, so it never reads as one more entry.
 */
const SPACER = ' '
const AVERAGE = 'Average'

function rowKey(c: CaseAggregate, mode: AggregateMode): string {
  if (mode === 'category') return c.root_cause_category || 'unknown'
  if (mode === 'scenario') return c.scenario
  if (mode === 'size') return c.topo_size ?? ''
  return c.problem
}

/** Topology sizes in their natural order, the size view's default row order. */
const SIZE_ORDER = ['s', 'm', 'l']
const SIZE_LABEL: Record<string, string> = { s: 'Small (S)', m: 'Medium (M)', l: 'Large (L)' }

/**
 * Failure domains read as names ("Routing"), not keys (routing_control_plane);
 * topology sizes as Small (S), Medium (M), Large (L). Node counts per size are not in the packages yet.
 */
function rowLabel(key: string, mode: AggregateMode): string {
  if (mode === 'category') return categoryLabel(key)
  if (mode === 'size') return SIZE_LABEL[key] ?? key.toUpperCase()
  return key
}

function mean(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null)
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null
}

export function MatrixPage() {
  const { filtered, withLabels, loading, error } = useLeaderboardData()
  const [params, setParams] = useSearchParams()
  const [rawDetails, setDetails] = useState<SubmissionDetail[]>([])
  const details = useMemo(() => withLabels(rawDetails), [rawDetails, withLabels])
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<AggregateMode>('problem')
  const [metric, setMetric] = useState<MetricMode>('rca')
  // Null keeps the rows' natural order: the size view lists S, M, L until
  // the Average header is clicked.
  const [rowSort, setRowSort] = useState<AverageSort | null>('desc')
  const [colSort, setColSort] = useState<AverageSort | null>(null)
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
    const value = (c: CaseAggregate) => (metric === 'success' ? c.success_rate : c.mean_rca_f1)
    // Some environments have no topology size; the size view leaves their
    // tasks out of every figure rather than showing an "unknown" row.
    const perCaseAll = details.map((d) =>
      aggregateByCase(d.trials).filter((c) => mode !== 'size' || Boolean(c.topo_size)),
    )
    // The Average row is each entry's mean over all its tasks, not over the
    // rows above: rows group different numbers of tasks.
    const columnAvgAll = perCaseAll.map((cases) => mean(cases.map(value)))
    const cols = details.map((_, i) => i)
    if (colSort) {
      cols.sort((a, b) => compareSortValues(columnAvgAll[a], columnAvgAll[b], colSort))
    }
    const names = cols.map((i) => details[i].name)
    const columnAvg = cols.map((i) => columnAvgAll[i])
    const taskCounts = cols.map((i) => perCaseAll[i].length)
    const overall = mean(columnAvg)
    const perEntry = cols.map((i) => {
      const buckets = new Map<string, { sum: number; n: number }>()
      for (const c of perCaseAll[i]) {
        const key = rowKey(c, mode)
        const cur = buckets.get(key) || { sum: 0, n: 0 }
        cur.sum += value(c)
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
      return { key, label: rowLabel(key, mode), values, avg: mean(values) ?? 0 }
    })
    const sizeRank = (key: string) => {
      const i = SIZE_ORDER.indexOf(key)
      return i < 0 ? SIZE_ORDER.length : i
    }
    rows.sort((a, b) =>
      rowSort
        ? compareSortValues(a.avg, b.avg, rowSort) || compareSortValues(a.label, b.label, 'asc')
        : sizeRank(a.key) - sizeRank(b.key) || compareSortValues(a.label, b.label, 'asc'),
    )

    return { rows, names, columnAvg, overall, taskCounts }
  }, [details, mode, metric, rowSort, colSort])

  /**
   * Margins and row pitch from the measured labels. ECharts' own estimate
   * (containLabel) undersizes a long category axis and clipped the longest
   * problem names, so the grid is laid out here instead.
   */
  const frame = useMemo(() => {
    const yLabels = [...matrix.rows.map((r) => r.label), SPACER, AVERAGE]
    const entryLabels = matrix.names
    const xLabels = [...entryLabels, SPACER, AVERAGE]
    const tilted = entryLabels.length > 8
    const yTick = categoryTickSize(yLabels.length)
    const xTick = categoryTickSize(xLabels.length)
    // The Average labels carry a sort mark and bold type: measure them so.
    const shown = (l: string) => (l === AVERAGE ? `${AVERAGE} ${SORT_MARK.none}` : l)
    const yLabelW = Math.max(0, ...yLabels.map((l) => measureText(shown(l), yTick, l === AVERAGE ? 800 : 500)))
    const xLabelW = Math.max(0, ...xLabels.map((l) => measureText(shown(l), xTick, 800)))
    const firstXW = entryLabels.length ? measureText(entryLabels[0], xTick, 500) : 0
    const left = 16 + Math.ceil(Math.max(yLabelW + 8, tilted ? firstXW * Math.SQRT1_2 : 0))
    const top = tilted
      ? Math.ceil(xLabelW * Math.SQRT1_2 + xTick) + 16
      : 2 * Math.round(xTick * 1.25) + 20
    const bottom = 16
    // A fixed row pitch, so every row keeps a readable label and value
    // however many problems there are.
    const pitch = yTick + 10
    // Tall enough for the colour scale beside it, however few rows there are.
    const plot = Math.max(yLabels.length * pitch, 180)
    return {
      yLabels,
      entryLabels,
      xLabels,
      tilted,
      left,
      top,
      bottom,
      plot,
      height: top + bottom + plot,
    }
  }, [matrix])

  const heatOption = useMemo((): EChartsOption => {
    const { yLabels, entryLabels, xLabels, tilted } = frame
    const avgX = xLabels.length - 1
    const avgY = yLabels.length - 1
    // Same colour scale as the cells, but outlined and set in heavier type.
    const averageCell = (x: number, y: number, v: number) => ({
      value: [x, y, Number(v.toFixed(4))] as [number, number, number],
      label: { color: heatInk(divergingColor(v)), fontWeight: 800, fontSize: 12 },
      itemStyle: { borderColor: CHART_FOCUS, borderWidth: 1.5 },
    })
    // Each cell's label takes white or dark ink by its own fill, so the
    // number stays legible from the darkest step of the ramp to the lightest.
    const data: Array<{
      value: [number, number, number]
      label: Record<string, unknown>
      itemStyle?: Record<string, unknown>
    }> = []
    matrix.rows.forEach((row, yi) => {
      row.values.forEach((v, xi) => {
        if (v != null) {
          data.push({
            value: [xi, yi, Number(v.toFixed(4))],
            label: { color: heatInk(divergingColor(v)) },
          })
        }
      })
      if (row.values.some((v) => v != null)) data.push(averageCell(avgX, yi, row.avg))
    })
    matrix.columnAvg.forEach((v, xi) => {
      if (v != null) data.push(averageCell(xi, avgY, v))
    })
    if (matrix.overall != null) data.push(averageCell(avgX, avgY, matrix.overall))
    const entries = (n: number) => `${n} selected ${n === 1 ? 'entry' : 'entries'}`
    return {
      tooltip: {
        formatter: (p: unknown) => {
          const item = p as { value: number[] }
          const [x, y, v] = item.value
          // A submission share is a percentage; RCA F1 is a score.
          const shown =
            metric === 'success' ? `${formatPct(v)} diagnosis submitted` : `RCA F1 ${formatScore(v)}`
          if (x === avgX && y === avgY) {
            return `Overall average<br/>Each entry's mean over all its tasks, averaged over ${entries(entryLabels.length)}<br/>${shown}`
          }
          if (y === avgY) {
            return `${xLabels[x]}<br/>Average over all ${matrix.taskCounts[x]} tasks<br/>${shown}`
          }
          const column = x === avgX ? `Average over ${entries(entryLabels.length)}` : xLabels[x]
          return `${column}<br/>${yLabels[y]}<br/>${shown}`
        },
      },
      grid: { left: frame.left, right: 88, top: frame.top, bottom: frame.bottom, containLabel: false },
      xAxis: {
        type: 'category',
        data: xLabels,
        position: 'top',
        // Axis labels are clickable: the Average ones sort the matrix.
        triggerEvent: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          // Model on one line, harness and qualifiers on the next. A wide
          // selection's columns are too narrow for two lines, so each label
          // goes on one line at 45 degrees; every column keeps its label.
          formatter: (v: string) =>
            v === AVERAGE
              ? `{avg|${AVERAGE} ${SORT_MARK[rowSort ?? 'none']}}`
              : tilted
                ? v
                : v.replace(' · ', '\n'),
          rich: { avg: { color: CHART_FOCUS, fontWeight: 800 } },
          rotate: tilted ? 45 : 0,
          interval: 0,
          fontSize: 11,
          lineHeight: 14,
          color: CHART_TEXT,
        },
      },
      yAxis: {
        type: 'category',
        data: yLabels,
        inverse: true,
        triggerEvent: true,
        axisLine: { show: false },
        axisTick: { show: false },
        // Every row is labelled.
        axisLabel: {
          fontSize: 11,
          color: CHART_TEXT,
          interval: 0,
          formatter: (v: string) =>
            v === AVERAGE ? `{avg|${AVERAGE} ${SORT_MARK[colSort ?? 'none']}}` : v,
          rich: { avg: { color: CHART_FOCUS, fontWeight: 800 } },
        },
      },
      visualMap: {
        min: 0,
        max: 1,
        calculable: true,
        orient: 'vertical',
        right: 8,
        // Level with the plot and no taller than it, so a short matrix does
        // not push the scale into the toolbox above.
        top: frame.top + 4,
        itemHeight: Math.min(140, frame.plot - 56),
        text: ['High', 'Low'],
        textGap: 8,
        textStyle: { color: CHART_MUTED },
        inRange: { color: [...DIVERGING_RAMP] },
      },
      series: [
        {
          type: 'heatmap',
          data,
          itemStyle: { borderColor: CHART_SURFACE, borderWidth: 1 },
          label: {
            show: true,
            fontSize: 11,
            fontWeight: 600,
            formatter: (p: unknown) => {
              const item = p as { value: number[] }
              const v = item.value[2]
              return metric === 'success' ? `${Math.round(v * 100)}` : formatScore(v)
            },
          },
        },
      ],
    }
  }, [matrix, frame, metric, rowSort, colSort])

  // Clicking the Average column's header sorts the rows by it; clicking the
  // Average row's label sorts the entry columns. Each click flips the order.
  const onEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const p = params as { componentType?: string; value?: unknown }
        if (p.value !== AVERAGE) return
        if (p.componentType === 'xAxis') setRowSort((s) => (s === 'desc' ? 'asc' : 'desc'))
        if (p.componentType === 'yAxis') setColSort((s) => (s === 'desc' ? 'asc' : 'desc'))
      },
    }),
    [],
  )

  const description = [
    METRIC_HELP[metric],
    "The Average column is the mean across the selected entries; the Average row is each entry's mean over all its tasks. Click either Average label to sort by it.",
    mode === 'size' ? 'Tasks whose network environment has no topology size are left out.' : null,
  ]
    .filter(Boolean)
    .join(' ')

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
          <h1>Task Matrix</h1>
          <p className="lede">
            RCA F1 or diagnosis submissions per failure, failure domain, network
            environment, or topology size, with averages across entries and tasks.
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
            onChange={(e) => {
              const next = e.target.value as AggregateMode
              setMode(next)
              setRowSort(next === 'size' ? null : 'desc')
            }}
          >
            {(Object.keys(AGGREGATE_LABEL) as AggregateMode[]).map((m) => (
              <option key={m} value={m}>
                {AGGREGATE_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label title={`${METRIC_HELP.rca}\n\n${METRIC_HELP.success}`}>
          Metric
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricMode)}
          >
            {(['rca', 'success'] as const).map((m) => (
              <option key={m} value={m}>
                {METRIC_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ChartPanel
        title={`${METRIC_LABEL[metric]} by ${AGGREGATE_LABEL[mode].toLowerCase()}`}
        description={description}
        option={heatOption}
        filename="nika-matrix"
        height={frame.height}
        onEvents={onEvents}
        empty={!details.length || !matrix.rows.length}
        emptyMessage={
          !details.length
            ? 'Select entries to plot.'
            : 'The selected packages carry no per-trial results, so there is nothing to break down by task.'
        }
        zoomSlider={false}
      />
    </div>
  )
}
