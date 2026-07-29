/** Infer a display family for bubble coloring from model name. */
export function inferModelFamily(model: string | null | undefined): string {
  const m = (model || '').toLowerCase()
  if (!m) return 'Other'
  if (m.includes('gpt-oss') || m.includes('gpt_oss')) return 'GPT-OSS'
  if (m.includes('gpt')) return 'GPT'
  if (m.includes('qwen')) return 'Qwen'
  if (m.includes('claude') || m.includes('sonnet') || m.includes('opus')) {
    return 'Claude'
  }
  if (m.includes('gemini') || m.includes('gemma')) return 'Gemini'
  if (m.includes('llama') || m.includes('meta-')) return 'Llama'
  if (m.includes('deepseek')) return 'DeepSeek'
  if (m.includes('mistral') || m.includes('mixtral')) return 'Mistral'
  return 'Other'
}

export const FAMILY_COLORS: Record<string, string> = {
  GPT: '#2563eb',
  'GPT-OSS': '#60a5fa',
  Qwen: '#dc2626',
  Claude: '#ea580c',
  Gemini: '#0e7490',
  Llama: '#7c3aed',
  DeepSeek: '#1d4ed8',
  Mistral: '#ca8a04',
  Other: '#64748b',
}

export function familyColor(family: string): string {
  return FAMILY_COLORS[family] || FAMILY_COLORS.Other
}

export function shortLabel(name: string, model: string | null, framework: string | null): string {
  const fw = framework || ''
  const m = model || ''
  if (m && fw) return `${m}/${fw}`
  return name
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
  /** Fixed axis max when set (after asPercent scaling). */
  max?: number
}

export const BUBBLE_AXIS_OPTIONS: BubbleAxisOption[] = [
  { key: 'detection', label: 'Detection', asPercent: true, max: 100 },
  { key: 'localization', label: 'Localization', asPercent: true, max: 100 },
  { key: 'rca', label: 'RCA F1', asPercent: true, max: 100 },
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
  if (key === 'mean_tokens') return Math.round(raw).toLocaleString()
  if (key === 'mean_steps') return raw.toFixed(1)
  return String(raw)
}

export function formatAxisDelta(
  a: BubblePoint,
  b: BubblePoint,
  key: BubbleAxisKey,
): string {
  const opt = bubbleAxisOption(key)
  const av = axisRawValue(a, key)
  const bv = axisRawValue(b, key)
  if (opt.asPercent) return formatDeltaPp(av, bv)
  const d = bv - av
  const sign = d > 0 ? '+' : ''
  if (key === 'mean_tokens') return `${sign}${Math.round(d).toLocaleString()}`
  if (key === 'mean_steps') return `${sign}${d.toFixed(1)}`
  return `${sign}${d.toFixed(0)}`
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
    return { min: Math.max(0, dataMin - pad), max: dataMax + pad }
  }
  const pad = (dataMax - dataMin) * 0.08
  return { min: Math.max(0, dataMin - pad), max: dataMax + pad }
}

export interface PairAnnotation {
  id: string
  fromId: string
  toId: string
  label: string
  color: string
}

export function makePairId(fromId: string, toId: string): string {
  return `${fromId}→${toId}`
}

export function deltaPp(a: number, b: number): number {
  return (b - a) * 100
}

export function formatDeltaPp(a: number, b: number, digits = 1): string {
  const d = deltaPp(a, b)
  const sign = d > 0 ? '+' : ''
  return `${sign}${d.toFixed(digits)} pp`
}
