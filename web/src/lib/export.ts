import { init, type EChartsType } from 'echarts'
import { CHART_SURFACE } from './chartTheme'
import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
}

export function downloadPng(chart: EChartsType | undefined, filename: string): void {
  if (!chart) return
  const url = chart.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: CHART_SURFACE,
  })
  triggerDownload(url, filename.endsWith('.png') ? filename : `${filename}.png`)
}

function cloneSvgForExport(svg: SVGSVGElement): SVGSVGElement {
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
  // Match the chart card the figure sits on.
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('x', '0')
  bg.setAttribute('y', '0')
  bg.setAttribute('width', '100%')
  bg.setAttribute('height', '100%')
  bg.setAttribute('fill', CHART_SURFACE)
  clone.insertBefore(bg, clone.firstChild)
  return clone
}

/**
 * Re-render a canvas chart off screen with the SVG renderer, at the same size
 * and zoom, so the PDF stays vector while the page keeps the smoother canvas.
 */
function renderSvgCopy(chart: EChartsType): { svg: SVGSVGElement | null; dispose: () => void } {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden'
  document.body.appendChild(host)
  const copy = init(host, null, {
    renderer: 'svg',
    width: chart.getWidth(),
    height: chart.getHeight(),
  })
  copy.setOption({ ...chart.getOption(), animation: false })
  return {
    svg: host.querySelector('svg'),
    dispose: () => {
      copy.dispose()
      host.remove()
    },
  }
}

/**
 * Export chart as a vector PDF via an SVG rendering of it.
 * Falls back to embedding a PNG if no SVG root is available.
 */
export async function downloadPdf(
  chart: EChartsType | undefined,
  filename: string,
): Promise<void> {
  if (!chart) return
  const outName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 24
  const maxW = pageW - margin * 2
  const maxH = pageH - margin * 2

  const copy = renderSvgCopy(chart)
  const svg = copy.svg
  if (svg instanceof SVGSVGElement) {
    const clone = cloneSvgForExport(svg)
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
      copy.dispose()
    }
    pdf.save(outName)
    return
  }
  copy.dispose()

  // Canvas fallback (raster).
  const url = chart.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: CHART_SURFACE,
  })
  pdf.addImage(url, 'PNG', margin, margin, maxW, maxH)
  pdf.save(outName)
}
