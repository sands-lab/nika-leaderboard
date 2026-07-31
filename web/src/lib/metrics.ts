import { resolveProvider } from './providerMeta'
import type { FilterState, SubmissionSummary } from './types'

/** Example harness optimizations shown in the filter even before submissions use them. */
export const HARNESS_OPTIMIZATION_EXAMPLES = [
  'GEPA',
  'skills',
  'Multi-agent',
] as const

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

export function harnessOptimizationOptions(fromMeta: string[]): string[] {
  return [...new Set([...HARNESS_OPTIMIZATION_EXAMPLES, ...fromMeta])].sort(
    (a, b) => a.localeCompare(b),
  )
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
    if (
      filters.optimization_method !== 'all' &&
      !(s.optimization_methods || []).includes(filters.optimization_method)
    ) {
      return false
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

export function exportCsv(rows: SubmissionSummary[], filename: string): void {
  const headers = [
    'rank',
    'name',
    'created_at',
    'model',
    'framework',
    'llm_provider',
    'benchmark_version',
    'split',
    'mean_rca_f1',
    'mean_localization_f1',
    'mean_detection_score',
    'success_rate',
    'n_success',
    'n_trials_expected',
    'mean_tokens',
    'mean_steps',
    'github',
    'site',
    'report',
  ]
  const lines = [headers.join(',')]
  for (const s of rows) {
    const record = s as unknown as Record<string, unknown>
    const vals = headers.map((h) => {
      const v = record[h]
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
