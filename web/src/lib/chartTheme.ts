/**
 * One source of truth for chart styling. Colours here were checked with the
 * data-viz palette validator against the dark chart surface rather than picked
 * by eye; the previous set failed three of its checks, most visibly violet
 * against blue (normal-vision ΔE 12, deuteranopic ΔE 1.3).
 */

/** The card every chart sits on (CSS --panel); palettes validate against it. */
export const CHART_SURFACE = '#0c1018'
/** A raised step of the same surface, for slider handles. */
export const CHART_RAISED = '#121722'

/** Values and labels that must read on their own. */
export const CHART_TEXT = '#e8edf5'
/** Axis names: a step above tick labels so the hierarchy reads. */
export const CHART_AXIS_NAME = '#c3cddc'
/** Tick labels, footnotes, anything secondary. */
export const CHART_MUTED = '#97a3b8'
/**
 * Selection and focus rings. White rather than the brand cyan, because cyan
 * is now the first series colour and a ring must stand apart from any mark.
 */
export const CHART_FOCUS = '#ffffff'

/** Grid, axis and frame lines: recessive by design. */
export const CHART_LINE = 'rgba(255, 255, 255, 0.08)'

/**
 * Categorical slots, assigned in fixed order and never cycled, so a colour
 * follows the entity rather than its rank. The hues are the NIKA main site's
 * own (cyan, violet, amber, pink, orange, emerald, blue, red), so charts and
 * page share one palette; each was stepped down in OKLCH lightness, hue kept,
 * to sit in the dark-mode mark band (L 0.48-0.67) - the site's cyan, emerald,
 * orange and amber are too light for marks as published.
 *
 * Validated against the #0c1018 chart surface: adjacent pairs (lines, bars,
 * legends) CVD deltaE >= 10.8, normal vision >= 17.9. Brand colours lead;
 * red is last so a series does not read as the leaderboard's "worse" rose.
 * Scatter and bubble forms compare every pair at once: the first four slots -
 * the families a default view shows - also clear that (CVD 8.2, normal 22.3).
 * Past four, identity rests on the direct labels those charts carry.
 */
export const SERIES_COLORS = [
  '#0da2c3', // cyan
  '#8b5cf6', // violet
  '#b68b07', // amber
  '#ec4899', // pink
  '#e76700', // orange
  '#04ad78', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
] as const

/** Colour for series `i`, stable as the selection grows or shrinks. */
export function seriesColor(i: number): string {
  return SERIES_COLORS[i % SERIES_COLORS.length]
}

/**
 * Past eight series the colours repeat, so each further round of eight gets
 * its own marker shape and line dash: a repeated colour is never the only
 * thing telling two series apart, in the plot or in the legend.
 */
const SERIES_SYMBOLS = ['circle', 'diamond', 'triangle', 'rect'] as const
const SERIES_DASHES = ['solid', 'dashed', 'dotted'] as const

export function seriesSymbol(i: number): (typeof SERIES_SYMBOLS)[number] {
  return SERIES_SYMBOLS[Math.floor(i / SERIES_COLORS.length) % SERIES_SYMBOLS.length]
}

export function seriesDash(i: number): (typeof SERIES_DASHES)[number] {
  return SERIES_DASHES[Math.floor(i / SERIES_COLORS.length) % SERIES_DASHES.length]
}

/** Hover cards, shared so they stop rendering as ECharts' default white box. */
export const CHART_TOOLTIP = {
  backgroundColor: 'rgba(12, 16, 24, 0.97)',
  borderColor: 'rgba(255, 255, 255, 0.14)',
  borderWidth: 1,
  padding: [8, 11] as [number, number],
  textStyle: { color: CHART_TEXT, fontSize: 12 },
  extraCssText: 'border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.45);',
}

/**
 * Sequential ramp for magnitudes (the confusion matrix): one hue, the brand
 * cyan, dark (low) to light (high), which reads as magnitude on a dark
 * surface. Built in OKLCH at cyan's hue; the first stop sits just above the
 * panel so a zero recedes, and the rest validate as an ordinal ramp against
 * the panel (#0c1018): monotone lightness, visible gaps, darkest step 2.1:1.
 */
export const HEAT_RAMP = [
  '#11282c',
  '#04515d',
  '#027687',
  '#099db2',
  '#13c6e0',
  '#7deaff',
] as const

/**
 * Diverging ramp for performance on an absolute 0-1 scale (solve rate, RCA F1
 * per case): rose for failure, cyan for success, a dark neutral at 0.5 - the
 * same worse/better hues as the leaderboard's score colours. Each arm is one
 * OKLCH hue with lightness rising toward its end, validated as an ordinal ramp
 * on the panel; rose against cyan stays apart for colour-blind readers. Both
 * ends stop at mid lightness (L 0.6-0.66): most cases are solved, and a
 * brighter cyan end turned the matrix into one glaring slab.
 */
export const DIVERGING_RAMP = ['#de6677', '#8e3d48', '#232a2c', '#025d6b', '#1790a2'] as const

/** Dark ink for text on the light end of the ramp. */
const HEAT_INK_DARK = '#0b1220'
const HEAT_INK_LIGHT = '#ffffff'

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

function rampColor(ramp: readonly string[], t: number): string {
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (ramp.length - 1)
  const i = Math.min(ramp.length - 2, Math.floor(x))
  const a = hexToRgb(ramp[i])
  const b = hexToRgb(ramp[i + 1])
  const f = x - i
  return rgbToHex(a.map((v, k) => v + (b[k] - v) * f))
}

/** Colour at `t` in [0, 1] along the sequential heat ramp. */
export function heatColor(t: number): string {
  return rampColor(HEAT_RAMP, t)
}

/** Colour for a 0-1 performance value on the diverging ramp. */
export function divergingColor(t: number): string {
  return rampColor(DIVERGING_RAMP, t)
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Whichever of white or dark ink has more contrast on `background`. */
export function heatInk(background: string): string {
  const l = luminance(background)
  const onWhite = 1.05 / (l + 0.05)
  const onDark = (l + 0.05) / (luminance(HEAT_INK_DARK) + 0.05)
  return onWhite >= onDark ? HEAT_INK_LIGHT : HEAT_INK_DARK
}
