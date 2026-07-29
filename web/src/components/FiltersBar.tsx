import type { FilterState, MetaFilters } from '../lib/types'

interface FiltersBarProps {
  filters: FilterState
  metaFilters: MetaFilters
  versions: string[]
  onChange: (next: FilterState) => void
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <label className="filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

export function FiltersBar({
  filters,
  metaFilters,
  versions,
  onChange,
}: FiltersBarProps) {
  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onChange({ ...filters, [key]: value })

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
        onChange={(v) => set('version', v)}
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
      />
      <Select
        label="Model"
        value={filters.model}
        options={metaFilters.model}
        onChange={(v) => set('model', v)}
      />
      <Select
        label="Fine-tune"
        value={filters.optimization_method}
        options={metaFilters.optimization_methods}
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
      <Select
        label="OS model"
        value={filters.os_model}
        options={['true', 'false']}
        onChange={(v) => set('os_model', v as FilterState['os_model'])}
      />
      <Select
        label="OS system"
        value={filters.os_system}
        options={['true', 'false']}
        onChange={(v) => set('os_system', v as FilterState['os_system'])}
      />
    </div>
  )
}
