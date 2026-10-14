import { CHART_MUTED, SERIES_COLORS } from './chartTheme'

/**
 * Known families, matched in order so the more specific name wins: GPT-OSS
 * before GPT, and TelecomGPT before either. Gemma is Google's open-weight line
 * and Gemini its hosted one; they share a vendor, not a family.
 */
const KNOWN_FAMILIES: Array<[RegExp, string]> = [
  [/telecomgpt/, 'TelecomGPT'],
  [/gpt[-_]?oss/, 'GPT-OSS'],
  [/^(gpt|o[134]\b|o[134]-)/, 'GPT'],
  [/qwen/, 'Qwen'],
  [/claude|sonnet|opus|haiku/, 'Claude'],
  [/gemini/, 'Gemini'],
  [/gemma/, 'Gemma'],
  [/llama|^meta-/, 'Llama'],
  [/deepseek/, 'DeepSeek'],
  [/mistral|mixtral/, 'Mistral'],
  [/otel/, 'OTel'],
]

/**
 * Display family for bubble coloring. An unlisted model is its own family,
 * named by the letters its id starts with, rather than being folded into a
 * family it does not belong to.
 */
export function inferModelFamily(model: string | null | undefined): string {
  const raw = (model || '').trim()
  if (!raw) return 'Other'
  const m = raw.toLowerCase()
  for (const [pattern, family] of KNOWN_FAMILIES) {
    if (pattern.test(m)) return family
  }
  return raw.match(/^[A-Za-z]+/)?.[0] ?? 'Other'
}

/**
 * Families take the shared categorical slots in a fixed order computed from
 * the whole archive, never from the current filter, so a family keeps its
 * colour however the selection changes. Families in the newest release come
 * first (then by entry count, then name): those are shown together by default,
 * so they get the slots that sit furthest apart. Past the eighth slot a family
 * folds into the muted "Other" colour rather than a generated hue; the
 * per-point labels still name it.
 */
export function familyPalette(
  entries: Array<{ model: string | null | undefined; benchmark_version: string }>,
): Map<string, string> {
  const versions = [...new Set(entries.map((e) => e.benchmark_version))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )
  const newest = versions[versions.length - 1]
  const counts = new Map<string, number>()
  const recent = new Map<string, number>()
  for (const e of entries) {
    const f = inferModelFamily(e.model)
    counts.set(f, (counts.get(f) ?? 0) + 1)
    if (e.benchmark_version === newest) recent.set(f, (recent.get(f) ?? 0) + 1)
  }
  const order = [...counts.keys()]
    .filter((f) => f !== 'Other')
    .sort(
      (a, b) =>
        (recent.get(b) ?? 0) - (recent.get(a) ?? 0) ||
        (counts.get(b) ?? 0) - (counts.get(a) ?? 0) ||
        a.localeCompare(b),
    )
  return new Map(
    order.map((f, i) => [f, i < SERIES_COLORS.length ? SERIES_COLORS[i] : CHART_MUTED]),
  )
}

export function familyColor(palette: Map<string, string>, family: string): string {
  return palette.get(family) ?? CHART_MUTED
}

export function shortLabel(name: string, model: string | null, framework: string | null): string {
  // The builder's label already includes recorded harness adaptations.
  const trimmed = name.trim()
  if (trimmed) return trimmed
  const fw = framework || ''
  const m = model || ''
  if (m && fw) return `${m}/${fw}`
  return m || fw || name
}

export interface BubblePoint {
  id: string
  name: string
  label: string
  model: string | null
  framework: string | null
  family: string
  detection: number
  localization: number
  rca: number
  cases: number
  success_rate: number
  mean_tokens: number
  mean_steps: number
}

export type BubbleAxisKey =
  | 'detection'
  | 'localization'
  | 'rca'
  | 'success_rate'
  | 'cases'
  | 'mean_tokens'
  | 'mean_steps'

export interface BubbleAxisOption {
  key: BubbleAxisKey
  label: string
  /** Display as percentage (0–100) in the chart. */
  asPercent: boolean
  /** A 0-1 score shown as a two-place decimal (F1, detection), not a share. */
  score?: boolean
  /** Fixed axis max when set (after asPercent scaling). */
  max?: number
}

export const BUBBLE_AXIS_OPTIONS: BubbleAxisOption[] = [
  { key: 'detection', label: 'Detection', asPercent: false, score: true, max: 1 },
  { key: 'localization', label: 'Localization', asPercent: false, score: true, max: 1 },
  { key: 'rca', label: 'RCA F1', asPercent: false, score: true, max: 1 },
  { key: 'success_rate', label: 'Success', asPercent: true, max: 100 },
  { key: 'cases', label: 'Cases', asPercent: false },
  { key: 'mean_tokens', label: 'Avg tokens', asPercent: false },
  { key: 'mean_steps', label: 'Avg steps', asPercent: false },
]

export function bubbleAxisOption(key: BubbleAxisKey): BubbleAxisOption {
  return (
    BUBBLE_AXIS_OPTIONS.find((o) => o.key === key) || BUBBLE_AXIS_OPTIONS[0]
  )
}

export function axisRawValue(point: BubblePoint, key: BubbleAxisKey): number {
  return point[key] ?? 0
}

/** Chart coordinate value (percent metrics → 0–100). */
export function axisPlotValue(point: BubblePoint, key: BubbleAxisKey): number {
  const opt = bubbleAxisOption(key)
  const raw = axisRawValue(point, key)
  return opt.asPercent ? raw * 100 : raw
}

export function formatAxisValue(point: BubblePoint, key: BubbleAxisKey): string {
  const opt = bubbleAxisOption(key)
  const raw = axisRawValue(point, key)
  if (opt.asPercent) return `${(raw * 100).toFixed(1)}%`
  if (opt.score) return raw.toFixed(2)
  if (key === 'mean_tokens') return Math.round(raw).toLocaleString()
  if (key === 'mean_steps') return raw.toFixed(1)
  return String(raw)
}

/** Format a score/metric delta for comparison arrows (no jargon). */
export function formatAxisDelta(
  a: BubblePoint,
  b: BubblePoint,
  key: BubbleAxisKey,
): string {
  const opt = bubbleAxisOption(key)
  const av = axisRawValue(a, key)
  const bv = axisRawValue(b, key)
  if (opt.asPercent) {
    const d = (bv - av) * 100
    const sign = d > 0 ? '+' : ''
    return `${sign}${d.toFixed(1)}%`
  }
  const d = bv - av
  const sign = d > 0 ? '+' : ''
  if (opt.score) return `${sign}${d.toFixed(2)}`
  if (key === 'mean_tokens') return `${sign}${Math.round(d).toLocaleString()}`
  if (key === 'mean_steps') return `${sign}${d.toFixed(1)}`
  return `${sign}${d.toFixed(0)}`
}

/** Compact tick label — avoid long floats on axes. */
export function formatAxisTick(value: number, asPercent: boolean): string {
  if (!Number.isFinite(value)) return ''
  if (asPercent) {
    const rounded = Math.round(value * 10) / 10
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
  }
  const abs = Math.abs(value)
  if (abs >= 1000) return `${Math.round(value).toLocaleString()}`
  if (abs >= 100) return `${Math.round(value)}`
  if (abs >= 10) {
    const rounded = Math.round(value * 10) / 10
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
  }
  const rounded = Math.round(value * 100) / 100
  if (Number.isInteger(rounded)) return `${rounded}`
  const asFixed = rounded.toFixed(2).replace(/\.?0+$/, '')
  return asFixed
}

function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(Math.max(range, Number.EPSILON)))
  const frac = range / 10 ** exp
  let nice: number
  if (round) {
    if (frac < 1.5) nice = 1
    else if (frac < 3) nice = 2
    else if (frac < 7) nice = 5
    else nice = 10
  } else if (frac <= 1) nice = 1
  else if (frac <= 2) nice = 2
  else if (frac <= 5) nice = 5
  else nice = 10
  return nice * 10 ** exp
}

export function axisRange(
  points: BubblePoint[],
  key: BubbleAxisKey,
): { min: number; max: number } {
  const opt = bubbleAxisOption(key)
  if (!points.length) {
    return { min: 0, max: opt.max ?? 1 }
  }
  const vals = points.map((p) => axisPlotValue(p, key))
  const dataMin = Math.min(...vals)
  const dataMax = Math.max(...vals)
  if (opt.max != null) {
    return { min: 0, max: opt.max }
  }
  if (dataMin === dataMax) {
    const pad = Math.max(Math.abs(dataMax) * 0.1, 1)
    const lo = Math.max(0, dataMin - pad)
    const hi = dataMax + pad
    return { min: Number(lo.toFixed(2)), max: Number(hi.toFixed(2)) }
  }
  const span = dataMax - dataMin
  const pad = span * 0.08
  let lo = Math.max(0, dataMin - pad)
  let hi = dataMax + pad
  const nice = niceNum(hi - lo, false)
  lo = Math.floor(lo / nice) * nice
  hi = Math.ceil(hi / nice) * nice
  if (lo < 0) lo = 0
  // Snap to short decimals for tick readability.
  const decimals = nice >= 1 ? 0 : nice >= 0.1 ? 1 : 2
  return {
    min: Number(lo.toFixed(decimals)),
    max: Number(hi.toFixed(decimals)),
  }
}

export type BubbleEncodeKey = BubbleAxisKey | 'fixed'

export const BUBBLE_SIZE_OPTIONS: Array<{ key: BubbleEncodeKey; label: string }> =
  [
    { key: 'cases', label: 'Cases' },
    { key: 'mean_tokens', label: 'Avg tokens' },
    { key: 'mean_steps', label: 'Avg steps' },
    { key: 'rca', label: 'RCA F1' },
    { key: 'detection', label: 'Detection' },
    { key: 'localization', label: 'Localization' },
    { key: 'success_rate', label: 'Success' },
    { key: 'fixed', label: 'Fixed' },
  ]

export const BUBBLE_OPACITY_OPTIONS: Array<{
  key: BubbleEncodeKey
  label: string
}> = [
  { key: 'rca', label: 'RCA F1' },
  { key: 'detection', label: 'Detection' },
  { key: 'localization', label: 'Localization' },
  { key: 'success_rate', label: 'Success' },
  { key: 'cases', label: 'Cases' },
  { key: 'mean_tokens', label: 'Avg tokens' },
  { key: 'mean_steps', label: 'Avg steps' },
  { key: 'fixed', label: 'Fixed' },
]

export function encodeRawValue(
  point: BubblePoint,
  key: BubbleEncodeKey,
): number {
  if (key === 'fixed') return 0
  return axisRawValue(point, key)
}

export function encodeExtents(
  points: BubblePoint[],
  key: BubbleEncodeKey,
): { min: number; max: number } {
  if (key === 'fixed' || !points.length) return { min: 0, max: 1 }
  const vals = points.map((p) => encodeRawValue(p, key))
  return { min: Math.min(...vals), max: Math.max(...vals) }
}

export function encodeLabel(key: BubbleEncodeKey): string {
  if (key === 'fixed') return 'Fixed'
  return bubbleAxisOption(key).label
}

export interface PairAnnotation {
  id: string
  fromId: string
  toId: string
  label: string
  color: string
  /** Hide the floating gain tag (arrow remains). */
  labelHidden?: boolean
  /** Pixel offset from the segment midpoint. */
  labelOffset?: { x: number; y: number }
}

export function makePairId(fromId: string, toId: string): string {
  return `${fromId}→${toId}`
}

/** Signed difference of two 0-1 scores, two places: "+0.05". */
export function formatScoreDelta(a: number, b: number): string {
  const d = b - a
  return `${d > 0 ? '+' : ''}${d.toFixed(2)}`
}
