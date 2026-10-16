import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Hover time before a tooltip shows; the browser's own waits about a second. */
const SHOW_DELAY_MS = 120
/** Gap between the hovered element and the tooltip. */
const GAP = 8
/** Closest the tooltip comes to the viewport edge. */
const EDGE = 8

interface Tip {
  text: string
  anchor: DOMRect
}

/**
 * Shows every `title` on the site as a styled tooltip after a short hover,
 * instead of the browser's slow native one. Components keep writing plain
 * `title` attributes; while an element is hovered its title is lifted off so
 * the native tooltip never starts, and put back when the pointer leaves, so
 * the DOM React manages is unchanged between hovers.
 */
export function FastTooltip() {
  const [tip, setTip] = useState<Tip | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let anchor: Element | null = null
    let saved = ''
    let timer: number | undefined
    let showing = false

    const release = () => {
      window.clearTimeout(timer)
      // Put the title back unless React set a new one meanwhile.
      if (anchor && !anchor.hasAttribute('title')) anchor.setAttribute('title', saved)
      anchor = null
      if (showing) {
        showing = false
        setTip(null)
      }
    }

    const show = () => {
      if (!anchor?.isConnected) return release()
      showing = true
      setTip({ text: saved, anchor: anchor.getBoundingClientRect() })
    }

    const onOver = (e: MouseEvent) => {
      const target = e.target as Element | null
      const next = target?.closest?.('[title]') ?? null
      // Still over the hovered element, with no titled element nested closer.
      if (anchor && anchor.contains(target) && (!next || !anchor.contains(next))) return
      const warm = showing
      release()
      const text = next?.getAttribute('title')
      if (!next || !text) return
      anchor = next
      saved = text
      next.removeAttribute('title')
      // Moving between tooltips shows the next one at once, as native ones do.
      if (warm) show()
      else timer = window.setTimeout(show, SHOW_DELAY_MS)
    }

    const onOut = (e: MouseEvent) => {
      if (!e.relatedTarget) release()
    }

    document.addEventListener('mouseover', onOver, true)
    document.addEventListener('mouseout', onOut, true)
    document.addEventListener('pointerdown', release, true)
    window.addEventListener('scroll', release, true)
    window.addEventListener('blur', release)
    return () => {
      release()
      document.removeEventListener('mouseover', onOver, true)
      document.removeEventListener('mouseout', onOut, true)
      document.removeEventListener('pointerdown', release, true)
      window.removeEventListener('scroll', release, true)
      window.removeEventListener('blur', release)
    }
  }, [])

  // Below the element, centred; above it when there is no room below.
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !tip) return
    const { width, height } = el.getBoundingClientRect()
    const a = tip.anchor
    const centre = a.left + a.width / 2
    const left = Math.min(
      Math.max(centre - width / 2, EDGE),
      window.innerWidth - width - EDGE,
    )
    const below = a.bottom + GAP
    const top =
      below + height > window.innerHeight - EDGE && a.top - GAP - height >= EDGE
        ? a.top - GAP - height
        : below
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
  }, [tip])

  if (!tip) return null
  return (
    <div ref={box} className="fast-tip" role="tooltip">
      {tip.text}
    </div>
  )
}
