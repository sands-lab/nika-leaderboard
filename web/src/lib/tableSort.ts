import { useState } from 'react'

export type SortDir = 'asc' | 'desc'

export interface SortState<K extends string = string> {
  key: K
  dir: SortDir
}

/** Null/undefined/'' always sort after real values. */
export function compareSortValues(
  a: unknown,
  b: unknown,
  dir: SortDir,
): number {
  const aEmpty = a == null || a === '' || (typeof a === 'number' && Number.isNaN(a))
  const bEmpty = b == null || b === '' || (typeof b === 'number' && Number.isNaN(b))
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1

  const mul = dir === 'asc' ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * mul
  }
  if (a instanceof Date && b instanceof Date) {
    return (a.getTime() - b.getTime()) * mul
  }
  return (
    String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: 'base',
    }) * mul
  )
}

export function sortByAccessors<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  accessors: Record<K, (row: T) => unknown>,
): T[] {
  const get = accessors[sort.key]
  if (!get) return rows
  return [...rows].sort((a, b) =>
    compareSortValues(get(a), get(b), sort.dir),
  )
}

/**
 * Clickable column sorting. Clicking a new column uses `defaultDir`
 * (desc for scores); clicking the active column toggles asc/desc.
 */
export function useTableSort<K extends string>(
  initial: SortState<K>,
  defaultDir: SortDir = 'desc',
) {
  const [sort, setSort] = useState<SortState<K>>(initial)

  const toggle = (key: K) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: defaultDir },
    )
  }

  return { sort, toggle, setSort }
}
