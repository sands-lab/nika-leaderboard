import { useEffect, useState } from 'react'

/**
 * Leaderboard columns that stay hidden until the viewer turns them on. The
 * default table keeps to what ranks and tells entries apart; these add detail
 * most readers do not need on every visit.
 */
export const OPTIONAL_COLUMNS = [
  { key: 'released', label: 'Released' },
  { key: 'optimizations', label: 'Agent optimizations' },
  { key: 'user', label: 'User' },
  { key: 'in_tokens', label: 'Input tokens / task' },
  { key: 'out_tokens', label: 'Output tokens / task' },
] as const

export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number]['key']

export type ColumnVisibility = Record<OptionalColumn, boolean>

const HIDDEN: ColumnVisibility = {
  released: false,
  optimizations: false,
  user: false,
  in_tokens: false,
  out_tokens: false,
}

const STORAGE_KEY = 'nika.leaderboard.columns.v1'

function load(): ColumnVisibility {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown
    if (!parsed || typeof parsed !== 'object') return HIDDEN
    const out = { ...HIDDEN }
    for (const key of Object.keys(HIDDEN) as OptionalColumn[]) {
      if ((parsed as Record<string, unknown>)[key] === true) out[key] = true
    }
    return out
  } catch {
    return HIDDEN
  }
}

/** Which optional columns are shown, remembered in this browser. */
export function useOptionalColumns() {
  const [visible, setVisible] = useState<ColumnVisibility>(load)

  useEffect(() => {
    try {
      if (Object.values(visible).some(Boolean)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(visible))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // Private windows and blocked site data: the choice lasts this session.
    }
  }, [visible])

  const toggle = (key: OptionalColumn) =>
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }))

  return { visible, toggle }
}
