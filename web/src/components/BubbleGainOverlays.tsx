import { useCallback, useEffect, useRef, useState } from 'react'
import type { EChartsType } from 'echarts'
import {
  type BubbleAxisKey,
  type BubblePoint,
  type PairAnnotation,
  axisPlotValue,
  bubbleAxisOption,
  formatAxisDelta,
  formatDeltaPp,
} from '../lib/insights'

interface BubbleGainOverlaysProps {
  chart: EChartsType | null
  pairs: PairAnnotation[]
  byId: Map<string, BubblePoint>
  xAxisKey: BubbleAxisKey
  yAxisKey: BubbleAxisKey
  onClose: (pairId: string) => void
  onOffsetChange: (pairId: string, offset: { x: number; y: number }) => void
}

interface TagLayout {
  id: string
  left: number
  top: number
  color: string
  title: string
  lines: string[]
}

export function BubbleGainOverlays({
  chart,
  pairs,
  byId,
  xAxisKey,
  yAxisKey,
  onClose,
  onOffsetChange,
}: BubbleGainOverlaysProps) {
  const [tags, setTags] = useState<TagLayout[]>([])
  const dragRef = useRef<{
    id: string
    startX: number
    startY: number
    originOffsetX: number
    originOffsetY: number
  } | null>(null)
  const [dragOffset, setDragOffset] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)

  const recompute = useCallback(() => {
    if (!chart) {
      setTags([])
      return
    }
    const xOpt = bubbleAxisOption(xAxisKey)
    const yOpt = bubbleAxisOption(yAxisKey)
    const next: TagLayout[] = []
    for (const pair of pairs) {
      if (pair.labelHidden) continue
      const a = byId.get(pair.fromId)
      const b = byId.get(pair.toId)
      if (!a || !b) continue
      const x1 = axisPlotValue(a, xAxisKey)
      const y1 = axisPlotValue(a, yAxisKey)
      const x2 = axisPlotValue(b, xAxisKey)
      const y2 = axisPlotValue(b, yAxisKey)
      const mid: [number, number] = [(x1 + x2) / 2, (y1 + y2) / 2]
      let pixel: number[]
      try {
        pixel = chart.convertToPixel({ seriesIndex: 0 }, mid) as number[]
      } catch {
        try {
          pixel = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, mid) as number[]
        } catch {
          continue
        }
      }
      if (!pixel || pixel.length < 2 || !Number.isFinite(pixel[0])) continue
      const ox = pair.labelOffset?.x ?? 0
      const oy = pair.labelOffset?.y ?? 0
      const live =
        dragOffset?.id === pair.id
          ? { x: dragOffset.x, y: dragOffset.y }
          : { x: ox, y: oy }
      next.push({
        id: pair.id,
        left: pixel[0] + live.x,
        top: pixel[1] + live.y,
        color: pair.color,
        title: pair.label,
        lines: [
          `${xOpt.label} ${formatAxisDelta(a, b, xAxisKey)}`,
          `${yOpt.label} ${formatAxisDelta(a, b, yAxisKey)}`,
          `RCA ${formatDeltaPp(a.rca, b.rca)}`,
        ],
      })
    }
    setTags(next)
  }, [chart, pairs, byId, xAxisKey, yAxisKey, dragOffset])

  useEffect(() => {
    recompute()
  }, [recompute])

  useEffect(() => {
    if (!chart) return
    const onUpdate = () => recompute()
    chart.on('finished', onUpdate)
    chart.on('rendered', onUpdate)
    chart.on('dataZoom', onUpdate)
    chart.on('restore', onUpdate)
    window.addEventListener('resize', onUpdate)
    return () => {
      chart.off('finished', onUpdate)
      chart.off('rendered', onUpdate)
      chart.off('dataZoom', onUpdate)
      chart.off('restore', onUpdate)
      window.removeEventListener('resize', onUpdate)
    }
  }, [chart, recompute])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      setDragOffset({
        id: drag.id,
        x: drag.originOffsetX + (e.clientX - drag.startX),
        y: drag.originOffsetY + (e.clientY - drag.startY),
      })
    }
    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const next = {
        x: drag.originOffsetX + (e.clientX - drag.startX),
        y: drag.originOffsetY + (e.clientY - drag.startY),
      }
      dragRef.current = null
      setDragOffset(null)
      onOffsetChange(drag.id, next)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onOffsetChange])

  if (!tags.length) return null

  return (
    <div className="bubble-gain-layer" aria-hidden={false}>
      {tags.map((tag) => (
        <div
          key={tag.id}
          className="bubble-gain-tag"
          style={{
            left: tag.left,
            top: tag.top,
            borderColor: tag.color,
            color: tag.color,
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return
            e.preventDefault()
            e.stopPropagation()
            const pair = pairs.find((p) => p.id === tag.id)
            dragRef.current = {
              id: tag.id,
              startX: e.clientX,
              startY: e.clientY,
              originOffsetX: pair?.labelOffset?.x ?? 0,
              originOffsetY: pair?.labelOffset?.y ?? 0,
            }
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          }}
        >
          <div className="bubble-gain-tag__head">
            <strong className="bubble-gain-tag__title">{tag.title}</strong>
            <button
              type="button"
              className="bubble-gain-tag__close"
              aria-label="Hide gain label"
              title="Hide label"
              onClick={(e) => {
                e.stopPropagation()
                onClose(tag.id)
              }}
            >
              ×
            </button>
          </div>
          {tag.lines.map((line) => (
            <div key={line} className="bubble-gain-tag__line">
              {line}
            </div>
          ))}
          <div className="bubble-gain-tag__hint">Drag to move</div>
        </div>
      ))}
    </div>
  )
}
