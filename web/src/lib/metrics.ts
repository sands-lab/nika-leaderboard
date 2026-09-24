import { resolveProvider } from './providerMeta'
import { submissionCost } from './pricing'
import type { PriceOverrides, PricingFile } from './pricing'
import type { FilterState, SubmissionSummary } from './types'

/**
 * Pre-benchmark adaptation / training methods (not scaffold extras like skills).
 * Shown in the Adaptation column; empty → "None".
 */
export const ADAPTATION_METHOD_EXAMPLES = ['GEPA', 'SFT', 'RL', 'GRPO'] as const

/** Query-string name for each filter, so a filtered view can be linked. */
const FILTER_PARAMS: Record<keyof FilterState, string> = {
  version: 'release',
  split: 'split',
  framework: 'scaffold',
  llm_provider: 'provider',
  model: 'model',
  optimization_method: 'adaptation',
  tag: 'tag',
  org: 'org',
  query: 'q',
}

/** Every query-string key the filters own, for clearing before a rewrite. */
export const FILTER_PARAM_KEYS = Object.values(FILTER_PARAMS)

/** Filters as a query string, omitting anything left at its default. */
export function filtersToParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, param] of Object.entries(FILTER_PARAMS) as Array<
    [keyof FilterState, string]
  >) {
    const value = filters[key]
    const isDefault = key === 'query' ? value === '' : value === 'all'
    if (!isDefault) params.set(param, String(value))
  }
  return params
}

/** Filters read back from a query string, falling back to `base`. */
export function filtersFromParams(
  params: URLSearchParams,
  base: FilterState,
): FilterState {
  const next = { ...base }
  for (const [key, param] of Object.entries(FILTER_PARAMS) as Array<
    [keyof FilterState, string]
  >) {
    const raw = params.get(param)
    if (raw != null) next[key] = raw
  }
  return next
}

/** Values that belong on scaffold tags, not Adaptation. */
const SCAFFOLD_EXTRA_METHODS = new Set(['skills', 'multi-agent', 'multiagent'])

export const defaultFilters = (version: string | 'all' = 'all'): FilterState => ({
  version,
  split: 'all',
  framework: 'all',
  llm_provider: 'all',
  model: 'all',
  optimization_method: 'all',
  tag: 'all',
  org: 'all',
  query: '',
})

/** Filter options for Adaptation (includes None + known methods from data). */
export function adaptationFilterOptions(fromMeta: string[]): string[] {
  const fromData = fromMeta.filter(
    (m) => !SCAFFOLD_EXTRA_METHODS.has(m.trim().toLowerCase()),
  )
  return [
    'None',
    ...new Set([...ADAPTATION_METHOD_EXAMPLES, ...fromData]),
  ].sort((a, b) => {
    if (a === 'None') return -1
    if (b === 'None') return 1
    return a.localeCompare(b)
  })
}

/** Pre-benchmark adaptations only (excludes skills / multi-agent extras). */
export function adaptationMethods(s: SubmissionSummary): string[] {
  return (s.optimization_methods || []).filter(
    (m) => !SCAFFOLD_EXTRA_METHODS.has(String(m).trim().toLowerCase()),
  )
}

export function formatAdaptation(s: SubmissionSummary): string {
  const methods = adaptationMethods(s)
  return methods.length > 0 ? methods.join(', ') : 'None'
}

/** Scaffold annotation tags (skills list, plus misfiled scaffold extras). */
export function scaffoldTags(s: SubmissionSummary): string[] {
  const tags: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    const label = String(raw).trim()
    if (!label) return
    const key = label.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    tags.push(label)
  }
  for (const skill of s.skills || []) push(skill)
  for (const m of s.optimization_methods || []) {
    if (SCAFFOLD_EXTRA_METHODS.has(String(m).trim().toLowerCase())) push(m)
  }
  return tags
}

export function applyFilters(
  rows: SubmissionSummary[],
  filters: FilterState,
): SubmissionSummary[] {
  const q = filters.query.trim().toLowerCase()
  return rows.filter((s) => {
    if (filters.version !== 'all' && s.benchmark_version !== filters.version) {
      return false
    }
    if (filters.split !== 'all' && s.split !== filters.split) return false
    if (filters.framework !== 'all' && s.framework !== filters.framework) {
      return false
    }
    if (filters.llm_provider !== 'all') {
      const provider = resolveProvider(s.llm_provider, s.model)
      if (provider !== filters.llm_provider) return false
    }
    if (filters.model !== 'all' && s.model !== filters.model) return false
    if (filters.optimization_method !== 'all') {
      const methods = adaptationMethods(s)
      if (filters.optimization_method === 'None') {
        if (methods.length > 0) return false
      } else if (!methods.includes(filters.optimization_method)) {
        return false
      }
    }
    if (filters.tag !== 'all' && !(s.tags || []).includes(filters.tag)) {
      return false
    }
    if (filters.org !== 'all' && (s.org || '') !== filters.org) return false
    if (q) {
      const hay = [
        s.name,
        s.authors,
        s.org,
        s.model,
        s.framework,
        s.llm_provider,
        resolveProvider(s.llm_provider, s.model),
        formatAdaptation(s),
        ...scaffoldTags(s),
        ...(s.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function withRanks(rows: SubmissionSummary[]): SubmissionSummary[] {
  const sorted = [...rows].sort((a, b) => {
    const av = a.mean_rca_f1 ?? -1
    const bv = b.mean_rca_f1 ?? -1
    if (bv !== av) return bv - av
    return (a.name || '').localeCompare(b.name || '')
  })
  return sorted.map((s, i) => ({ ...s, rank: i + 1 }))
}

export function exportCsv(
  rows: SubmissionSummary[],
  filename: string,
  pricing: PricingFile | null = null,
  overrides: PriceOverrides = {},
): void {
  const headers = [
    'rank',
    'model',
    'created_at',
    'framework',
    'adaptation',
    'skills',
    'llm_provider',
    'name',
    'benchmark_version',
    'split',
    'mean_detection_score',
    'mean_localization_f1',
    'mean_rca_f1',
    'success_rate',
    'n_success',
    'n_trials_expected',
    'mean_tokens',
    'cost_per_run_usd',
    'cost_per_case_usd',
    'cost_total_usd',
    'mean_steps',
    'github',
    'site',
    'report',
  ]
  const lines = [headers.join(',')]
  for (const s of rows) {
    const record = s as unknown as Record<string, unknown>
    const vals = headers.map((h) => {
      let v: unknown
      const cost = submissionCost(s, pricing, overrides)
      if (h === 'adaptation') v = formatAdaptation(s)
      else if (h === 'cost_per_run_usd') v = cost?.perRun ?? ''
      else if (h === 'cost_per_case_usd') v = cost?.perCase ?? ''
      else if (h === 'cost_total_usd') v = cost?.total ?? ''
      else if (h === 'skills') v = scaffoldTags(s).join('; ')
      else v = record[h]
      const str = v == null ? '' : String(v)
      return `"${str.replace(/"/g, '""')}"`
    })
    lines.push(vals.join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
