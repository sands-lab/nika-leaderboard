/**
 * One source of truth for chart styling. Colours here were checked with the
 * data-viz palette validator against the dark chart surface rather than picked
 * by eye; the previous set failed three of its checks, most visibly violet
 * against blue (normal-vision ΔE 12, deuteranopic ΔE 1.3).
 */

/** Values and labels that must read on their own. */
export const CHART_TEXT = '#e2e8f0'
/** Axis names: a step above tick labels so the hierarchy reads. */
export const CHART_AXIS_NAME = '#c7d2e0'
/** Tick labels, footnotes, anything secondary. */
export const CHART_MUTED = '#8b9cb6'
/** The brand accent, for selection and focus rings only — never a series. */
export const CHART_FOCUS = '#00d4ff'

/** Grid, axis and frame lines: recessive by design. */
export const CHART_LINE = 'rgba(255, 255, 255, 0.1)'

/**
 * Categorical slots, assigned in fixed order and never cycled, so a colour
 * follows the entity rather than its rank. This is the documented eight-slot
 * order stepped for a dark surface; it validates on the adjacent pairlist
 * (lines, bars, legends) against this site's #0d1525 chart surface, with the
 * same worst pairs as the six-slot subset it replaces — CVD deltaE 8.4 on
 * yellow/aqua, normal-vision 19.3 on magenta/yellow.
 *
 * Eight rather than six because there are eight model families to name, and a
 * short list forced two of them to share a hue with another family.
 *
 * Scatter and bubble forms compare every pair at once, and no ordering of the
 * full set clears that bar; only the first three slots do. Past three, such a
 * chart needs direct labels to carry identity — which the bubble chart has.
 *
 * The green and red slots are the categorical steps, deliberately distinct
 * from the reserved status colours, which are never reused as a series.
 */
export const SERIES_COLORS = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
] as const

/** Colour for series `i`, stable as the selection grows or shrinks. */
export function seriesColor(i: number): string {
  return SERIES_COLORS[i % SERIES_COLORS.length]
}

/** Hover cards, shared so they stop rendering as ECharts' default white box. */
export const CHART_TOOLTIP = {
  backgroundColor: 'rgba(13, 21, 37, 0.96)',
  borderColor: 'rgba(255, 255, 255, 0.14)',
  borderWidth: 1,
  padding: [8, 11] as [number, number],
  textStyle: { color: CHART_TEXT, fontSize: 12 },
  extraCssText: 'border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.45);',
}

/**
 * Sequential ramp for heatmaps: one hue, dark (low) to light (high), which is
 * the direction that reads as magnitude on a dark surface. Shared so the case
 * matrix and the confusion matrix encode intensity identically.
 */
export const HEAT_RAMP = [
  '#0d1525',
  '#0f2940',
  '#0a4a6e',
  '#0284c7',
  '#00d4ff',
  '#67e8f9',
] as const
