import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export interface MultiSelectOption {
  value: string
  label: string
  /** Second, quieter line under the label. */
  hint?: string
  /** Entries this value would show, set after the label. */
  count?: number
}

/**
 * A dropdown of checkboxes. An empty selection means "All", so the closed
 * control reads like a single select until something is ticked.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  allLabel = 'All',
  noun = 'selected',
  searchable,
  actions,
  ariaLabel,
  emptyText = 'No options.',
}: {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Closed text when nothing is ticked. */
  allLabel?: string
  /** Closed text after the count when several are ticked, e.g. "models". */
  noun?: string
  /** Show a search box; defaults to on for long lists. */
  searchable?: boolean
  /** Replaces the default "Clear" row at the top of the menu. */
  actions?: (shown: MultiSelectOption[]) => ReactNode
  ariaLabel?: string
  emptyText?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [alignEnd, setAlignEnd] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const withSearch = searchable ?? options.length > 8

  // Close on a click elsewhere or Escape, like any other menu.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // Its placement was measured for the old width, so a new width closes
    // it. Height is ignored: a phone keyboard opening for the search changes it.
    const width = window.innerWidth
    const onResize = () => {
      if (window.innerWidth !== width) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  // A control near the right edge opens its menu leftwards, not off-screen.
  useLayoutEffect(() => {
    if (!open || !root.current || !menu.current) return
    const left = root.current.getBoundingClientRect().left
    const width = menu.current.getBoundingClientRect().width
    setAlignEnd(left + width > document.documentElement.clientWidth - 8)
  }, [open])

  const chosen = new Set(selected)
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? labelOf(selected[0])
        : `${selected.length} ${noun}`

  // A ticked value with no option (e.g. from an old link) stays listed, so it
  // can be unticked.
  const known = new Set(options.map((o) => o.value))
  const listed: MultiSelectOption[] = [
    ...options,
    ...selected.filter((v) => !known.has(v)).map((v) => ({ value: v, label: v })),
  ]
  const q = query.trim().toLowerCase()
  const shown = q
    ? listed.filter((o) =>
        `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q),
      )
    : listed

  const toggle = (v: string) =>
    onChange(chosen.has(v) ? selected.filter((x) => x !== v) : [...selected, v])

  return (
    <div className="multi-select" ref={root}>
      <button
        type="button"
        className={`multi-select__button${selected.length ? ' multi-select__button--active' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        title={selected.length > 1 ? selected.map(labelOf).join(', ') : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="multi-select__summary">{summary}</span>
        <span className="multi-select__chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          id={menuId}
          ref={menu}
          className={`multi-select__menu${alignEnd ? ' multi-select__menu--end' : ''}`}
        >
          {withSearch && (
            <input
              type="search"
              className="multi-select__search"
              placeholder="Search…"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <div className="multi-select__actions">
            {actions ? (
              actions(shown)
            ) : (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!selected.length}
                onClick={() => onChange([])}
              >
                {allLabel === 'All' ? 'Clear (show all)' : 'Clear'}
              </button>
            )}
          </div>
          <div className="multi-select__list">
            {shown.map((o) => (
              <label key={o.value} className="multi-select__option">
                <input
                  type="checkbox"
                  checked={chosen.has(o.value)}
                  onChange={() => toggle(o.value)}
                />
                <span className="multi-select__text">
                  {o.label}
                  {o.hint && <small>{o.hint}</small>}
                </span>
                {o.count != null && (
                  <span className="multi-select__count">{o.count}</span>
                )}
              </label>
            ))}
            {shown.length === 0 && (
              <p className="muted multi-select__empty">
                {q ? 'No matches.' : emptyText}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
