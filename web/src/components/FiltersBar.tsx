import {
  adaptationFilterOptions,
  defaultFilters,
  facetCounts,
} from '../lib/metrics'
import type {
  FilterState,
  MetaFile,
  MetaFilters,
  MultiFilterKey,
  SubmissionSummary,
} from '../lib/types'
import { MultiSelect } from './MultiSelect'

interface FiltersBarProps {
  filters: FilterState
  /** Every entry, to count what each filter value would show. */
  submissions: SubmissionSummary[]
  metaFilters: MetaFilters
  vendors?: MetaFile['vendors']
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
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  formatOption?: (v: string) => string
}) {
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

function MultiFilter({
  label,
  noun,
  value,
  options,
  counts,
  onChange,
  formatOption,
}: {
  label: string
  /** Plural for the closed control, e.g. "3 models". */
  noun: string
  value: string[]
  /** Every known value, in display order. */
  options: string[]
  /** Entries per value under the other filters; see `facetCounts`. */
  counts: Map<string, number>
  onChange: (v: string[]) => void
  formatOption?: (v: string) => string
}) {
  // With one value or none, picking it is the same as "All", so the control
  // only implies there is something to narrow by. Kept if already set. This
  // looks at every known value, so narrowing another filter does not make
  // the control disappear.
  if (options.length <= 1 && value.length === 0) return null

  // Offer only values that would show something; a ticked one stays listed
  // so it can be unticked.
  const listed = options.filter((o) => counts.has(o) || value.includes(o))

  return (
    // A div, not a label: a label would forward clicks in the menu to the button.
    <div className="filter" role="group" aria-label={label}>
      <span>{label}</span>
      <MultiSelect
        ariaLabel={label}
        noun={noun}
        selected={value}
        onChange={onChange}
        options={listed.map((o) => ({
          value: o,
          label: formatOption ? formatOption(o) : o,
          count: counts.get(o) ?? 0,
        }))}
      />
    </div>
  )
}

function isDefaultFilters(filters: FilterState): boolean {
  const d = defaultFilters('all')
  return (Object.keys(d) as Array<keyof FilterState>).every((k) => {
    const v = filters[k]
    return Array.isArray(v) ? v.length === 0 : v === d[k]
  })
}

export function FiltersBar({
  filters,
  submissions,
  metaFilters,
  vendors,
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
  const counts = (key: MultiFilterKey) => facetCounts(submissions, filters, key)

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
      />
      <MultiFilter
        label="Split"
        noun="splits"
        value={filters.split}
        counts={counts('split')}
        options={metaFilters.split}
        onChange={(v) => set('split', v)}
      />
      <MultiFilter
        label="Harness"
        noun="harnesses"
        value={filters.framework}
        counts={counts('framework')}
        options={metaFilters.framework}
        onChange={(v) => set('framework', v)}
      />
      <MultiFilter
        label="Provider"
        noun="providers"
        value={filters.llm_provider}
        counts={counts('llm_provider')}
        options={metaFilters.llm_provider}
        onChange={(v) => set('llm_provider', v)}
        formatOption={(v) => vendors?.[v]?.label ?? v}
      />
      <MultiFilter
        label="Model"
        noun="models"
        value={filters.model}
        counts={counts('model')}
        options={metaFilters.model}
        onChange={(v) => set('model', v)}
      />
      <MultiFilter
        label="Agent optimizations"
        noun="optimizations"
        value={filters.optimization_method}
        counts={counts('optimization_method')}
        options={adaptationOptions}
        onChange={(v) => set('optimization_method', v)}
      />
      <MultiFilter
        label="Tag"
        noun="tags"
        value={filters.tag}
        counts={counts('tag')}
        options={metaFilters.tags}
        onChange={(v) => set('tag', v)}
      />
      <MultiFilter
        label="Org"
        noun="orgs"
        value={filters.org}
        counts={counts('org')}
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
