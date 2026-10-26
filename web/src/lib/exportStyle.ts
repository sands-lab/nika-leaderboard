import { useSyncExternalStore } from 'react'
import type { ExportStyle } from './chartTheme'

const TONE_KEY = 'nika.export.tone.v1'
const OPAQUE_KEY = 'nika.export.opaque.v1'

function load(): ExportStyle {
  try {
    return {
      tone: localStorage.getItem(TONE_KEY) === 'dark' ? 'dark' : 'light',
      transparent: localStorage.getItem(OPAQUE_KEY) !== '1',
    }
  } catch {
    return { tone: 'light', transparent: true }
  }
}

let style: ExportStyle = load()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setExportStyle(next: Partial<ExportStyle>): void {
  style = { ...style, ...next }
  try {
    if (style.tone === 'light') localStorage.removeItem(TONE_KEY)
    else localStorage.setItem(TONE_KEY, style.tone)
    if (style.transparent) localStorage.removeItem(OPAQUE_KEY)
    else localStorage.setItem(OPAQUE_KEY, '1')
  } catch {
    // Private windows and blocked site data: the choice still holds this session.
  }
  listeners.forEach((l) => l())
}

/**
 * How chart downloads are made, shared by every chart panel and kept in this
 * browser, so one choice holds for a whole set of figures.
 */
export function useExportStyle(): [ExportStyle, (next: Partial<ExportStyle>) => void] {
  return [useSyncExternalStore(subscribe, () => style), setExportStyle]
}
