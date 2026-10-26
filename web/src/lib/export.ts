import { init, type EChartsOption, type EChartsType } from 'echarts'
import { LIGHT_EXPORT_INK, exportBackground, type ExportStyle } from './chartTheme'
import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
}

/** Translucent white (radar bands, grid fills) turns to translucent black. */
const TRANSLUCENT_WHITE = /^rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)$/

function recolor(value: unknown, ink: Record<string, string>): unknown {
  if (typeof value === 'string') {
    if (value in ink) return ink[value]
    const white = TRANSLUCENT_WHITE.exec(value)
    return white ? `rgba(0, 0, 0, ${white[1]})` : value
  }
  if (Array.isArray(value)) return value.map((v) => recolor(v, ink))
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, recolor(v, ink)]),
    )
  }
  return value
}

/**
 * The chart's current option, made into a figure: on the chosen background
 * (or none), without the zoom toolbox and sliders (the zoom window itself is
 * kept), and recoloured for a light background when asked.
 */
function exportOption(chart: EChartsType, style: ExportStyle): EChartsOption {
  const option = chart.getOption() as EChartsOption
  const dataZoom = Array.isArray(option.dataZoom)
    ? option.dataZoom.map((dz) => ({ ...dz, show: false }))
    : option.dataZoom
  const figure: EChartsOption = { ...option, toolbox: [], dataZoom }
  return {
    ...(style.tone === 'light' ? (recolor(figure, LIGHT_EXPORT_INK) as EChartsOption) : figure),
    backgroundColor: exportBackground(style),
    animation: false,
  }
}

/** Re-render the chart off screen, at the same size and zoom, as a figure. */
function renderCopy(
  chart: EChartsType,
  style: ExportStyle,
  renderer: 'canvas' | 'svg',
): { copy: EChartsType; host: HTMLElement; dispose: () => void } {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden'
  document.body.appendChild(host)
  const copy = init(host, null, {
    renderer,
    width: chart.getWidth(),
    height: chart.getHeight(),
  })
  copy.setOption(exportOption(chart, style))
  return {
    copy,
    host,
    dispose: () => {
      copy.dispose()
      host.remove()
    },
  }
}

function pngUrl(chart: EChartsType, style: ExportStyle): string {
  const { copy, dispose } = renderCopy(chart, style, 'canvas')
  try {
    return copy.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: exportBackground(style) })
  } finally {
    dispose()
  }
}

export function downloadPng(
  chart: EChartsType | undefined,
  filename: string,
  style: ExportStyle,
): void {
  if (!chart) return
  triggerDownload(pngUrl(chart, style), filename.endsWith('.png') ? filename : `${filename}.png`)
}

function cloneSvgForExport(svg: SVGSVGElement, background: string): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement
  // Ensure explicit size so svg2pdf can scale predictably.
  const bbox = svg.getBoundingClientRect()
  const width = Math.max(1, Math.round(bbox.width || Number(svg.getAttribute('width')) || 800))
  const height = Math.max(1, Math.round(bbox.height || Number(svg.getAttribute('height')) || 450))
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }
  if (background !== 'transparent') {
    // An explicit fill, so svg2pdf paints the page behind an opaque figure.
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('x', '0')
    bg.setAttribute('y', '0')
    bg.setAttribute('width', '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill', background)
    clone.insertBefore(bg, clone.firstChild)
  }
  return clone
}

/**
 * Export chart as a vector PDF via an SVG rendering of it, with no fill
 * behind it unless the style asks for one. Falls back to embedding a PNG if
 * no SVG root is available.
 */
export async function downloadPdf(
  chart: EChartsType | undefined,
  filename: string,
  style: ExportStyle,
): Promise<void> {
  if (!chart) return
  const outName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 24
  const maxW = pageW - margin * 2
  const maxH = pageH - margin * 2

  const rendered = renderCopy(chart, style, 'svg')
  const svg = rendered.host.querySelector('svg')
  if (svg instanceof SVGSVGElement) {
    const clone = cloneSvgForExport(svg, exportBackground(style))
    const vb = clone.viewBox.baseVal
    const srcW = vb.width || Number(clone.getAttribute('width')) || maxW
    const srcH = vb.height || Number(clone.getAttribute('height')) || maxH
    const scale = Math.min(maxW / srcW, maxH / srcH)
    const drawW = srcW * scale
    const drawH = srcH * scale
    const x = margin + (maxW - drawW) / 2
    const y = margin + (maxH - drawH) / 2
    // Off-DOM host required by svg2pdf for measurement in some browsers.
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden'
    host.appendChild(clone)
    document.body.appendChild(host)
    try {
      await svg2pdf(clone, pdf, { x, y, width: drawW, height: drawH })
    } finally {
      host.remove()
      rendered.dispose()
    }
    pdf.save(outName)
    return
  }
  rendered.dispose()

  // Canvas fallback (raster).
  pdf.addImage(pngUrl(chart, style), 'PNG', margin, margin, maxW, maxH)
  pdf.save(outName)
}
