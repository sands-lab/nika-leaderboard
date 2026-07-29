import type { ReactNode } from 'react'
import type { SortState } from '../lib/tableSort'

interface SortableThProps<K extends string> {
  label: ReactNode
  sortKey: K
  sort: SortState<K>
  onSort: (key: K) => void
  title?: string
  className?: string
}

export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  title,
  className,
}: SortableThProps<K>) {
  const active = sort.key === sortKey
  const ariaSort = active
    ? sort.dir === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none'

  return (
    <th
      className={`sortable-th${active ? ' is-sorted' : ''}${className ? ` ${className}` : ''}`}
      title={title}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className="sortable-th__btn"
        onClick={() => onSort(sortKey)}
      >
        <span className="sortable-th__label">{label}</span>
        <span className="sortable-th__indicator" aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  )
}
