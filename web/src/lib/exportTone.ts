import { useSyncExternalStore } from 'react'
import type { ExportTone } from './chartTheme'

const TONE_KEY = 'nika.export.tone.v1'

function load(): ExportTone {
  try {
    return localStorage.getItem(TONE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

let tone: ExportTone = load()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setExportTone(next: ExportTone): void {
  tone = next
  try {
    if (next === 'light') localStorage.removeItem(TONE_KEY)
    else localStorage.setItem(TONE_KEY, next)
  } catch {
    // Private windows and blocked site data: the choice still holds this session.
  }
  listeners.forEach((l) => l())
}

/**
 * The background chart downloads are made for, shared by every chart panel
 * and kept in this browser, so one choice holds for a whole set of figures.
 */
export function useExportTone(): [ExportTone, (tone: ExportTone) => void] {
  return [useSyncExternalStore(subscribe, () => tone), setExportTone]
}
