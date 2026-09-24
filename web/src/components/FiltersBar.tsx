import {
  adaptationFilterOptions,
  defaultFilters,
} from '../lib/metrics'
import { providerDisplayName } from '../lib/providerMeta'
import type { FilterState, MetaFilters } from '../lib/types'

interface FiltersBarProps {
  filters: FilterState
  metaFilters: MetaFilters
  versions: string[]
  /** Releases that actually have submissions; the rest are flagged as empty. */
  versionsWithData?: Set<string>
  onChange: (next: FilterState) => void
}

function Select({
  label,
  value,
  options,
  onChange,
  formatOption,
  alwaysShow = false,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  formatOption?: (v: string) => string
  /** For a facet that states scope rather than narrows, e.g. the release. */
  alwaysShow?: boolean
}) {
  // With one value or none, picking it is the same as "All", so the control
  // only implies there is something to narrow by. Kept if already set.
  if (!alwaysShow && options.length <= 1 && value === 'all') return null

  return (
    <label className="filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {formatOption ? formatOption(o) : o}
          </option>
        ))}
      </select>
    </label>
  )
}

function isDefaultFilters(filters: FilterState): boolean {
  const d = defaultFilters('all')
  return (Object.keys(d) as Array<keyof FilterState>).every(
    (k) => filters[k] === d[k],
  )
}

export function FiltersBar({
  filters,
  metaFilters,
  versions,
  versionsWithData,
  onChange,
}: FiltersBarProps) {
  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onChange({ ...filters, [key]: value })
  const cleared = isDefaultFilters(filters)
  const adaptationOptions = adaptationFilterOptions(
    metaFilters.optimization_methods,
  )

  return (
    <div className="filters">
      <label className="filter filter--grow">
        <span>Search</span>
        <input
          type="search"
          placeholder="Name, model, org, tag…"
          value={filters.query}
          onChange={(e) => set('query', e.target.value)}
        />
      </label>
      <Select
        label="Release"
        value={filters.version}
        options={versions}
        formatOption={(v) =>
          versionsWithData && !versionsWithData.has(v) ? `${v} (no entries)` : v
        }
        onChange={(v) => set('version', v)}
        alwaysShow
      />
      <Select
        label="Split"
        value={filters.split}
        options={metaFilters.split}
        onChange={(v) => set('split', v)}
      />
      <Select
        label="Scaffold"
        value={filters.framework}
        options={metaFilters.framework}
        onChange={(v) => set('framework', v)}
      />
      <Select
        label="Provider"
        value={filters.llm_provider}
        options={metaFilters.llm_provider}
        onChange={(v) => set('llm_provider', v)}
        formatOption={providerDisplayName}
      />
      <Select
        label="Model"
        value={filters.model}
        options={metaFilters.model}
        onChange={(v) => set('model', v)}
      />
      <Select
        label="Adaptation"
        value={filters.optimization_method}
        options={adaptationOptions}
        onChange={(v) => set('optimization_method', v)}
      />
      <Select
        label="Tag"
        value={filters.tag}
        options={metaFilters.tags}
        onChange={(v) => set('tag', v)}
      />
      <Select
        label="Org"
        value={filters.org}
        options={metaFilters.org}
        onChange={(v) => set('org', v)}
      />
      <div className="filter filter--action">
        <span className="filter__spacer" aria-hidden="true">
          &nbsp;
        </span>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={cleared}
          onClick={() => onChange(defaultFilters('all'))}
          title="Reset all filters"
        >
          Clear filters
        </button>
      </div>
    </div>
  )
}
