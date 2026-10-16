import { useEffect, useId, useRef, useState } from 'react'
import {
  OPTIONAL_COLUMNS,
  type ColumnVisibility,
  type OptionalColumn,
} from '../lib/optionalColumns'

/** A "Columns" menu of checkboxes for the leaderboard's optional columns. */
export function ColumnPicker({
  visible,
  onToggle,
}: {
  visible: ColumnVisibility
  onToggle: (key: OptionalColumn) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const shown = OPTIONAL_COLUMNS.filter((c) => visible[c.key]).length

  // Close on a click elsewhere or Escape, like any other menu.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="column-picker" ref={root}>
      <button
        type="button"
        className="btn btn--ghost"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        title="Show or hide additional columns"
      >
        Columns{shown > 0 ? ` (+${shown})` : ''}
      </button>
      {open && (
        <fieldset id={menuId} className="column-picker__menu">
          <legend className="column-picker__legend">Additional columns</legend>
          {OPTIONAL_COLUMNS.map((c) => (
            <label key={c.key} className="column-picker__option">
              <input
                type="checkbox"
                checked={visible[c.key]}
                onChange={() => onToggle(c.key)}
              />
              {c.label}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  )
}
