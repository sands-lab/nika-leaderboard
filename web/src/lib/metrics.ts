import { entryLinks } from './data'
import { modelReleaseDate } from './modelMeta'
import { modelKey, submissionCost, taskTokens } from './pricing'
import type { PriceMode, PriceOverrides, PricingFile } from './pricing'
import type { FilterState, MultiFilterKey, SubmissionSummary } from './types'

/** Query-string name for each filter, so a filtered view can be linked. */
const FILTER_PARAMS: Record<keyof FilterState, string> = {
  version: 'release',
  split: 'split',
  framework: 'harness',
  llm_provider: 'provider',
  model: 'model',
  optimization_method: 'adaptation',
  tag: 'tag',
  org: 'org',
  query: 'q',
}

/** Earlier names of a filter's parameter, still read so old links keep working. */
const LEGACY_FILTER_PARAMS: Partial<Record<keyof FilterState, string>> = {
  framework: 'scaffold',
}

/** Every query-string key the filters own, for clearing before a rewrite. */
export const FILTER_PARAM_KEYS = [
  ...Object.values(FILTER_PARAMS),
  ...Object.values(LEGACY_FILTER_PARAMS),
]

/**
 * Filters as a query string, omitting anything left at its default. A facet
 * with several values repeats its parameter, e.g. `?model=A&model=B`.
 */
export function filtersToParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, param] of Object.entries(FILTER_PARAMS) as Array<
    [keyof FilterState, string]
  >) {
    const value = filters[key]
    if (Array.isArray(value)) {
      for (const v of value) params.append(param, v)
    } else if (key === 'query' ? value !== '' : value !== 'all') {
      params.set(param, value)
    }
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
    const legacy = LEGACY_FILTER_PARAMS[key]
    if (Array.isArray(base[key])) {
      let values = params.getAll(param)
      if (!values.length && legacy) values = params.getAll(legacy)
      // 'all' was how a single-value link said "no filter".
      values = values.filter((v) => v && v !== 'all')
      if (values.length) next[key as MultiFilterKey] = [...new Set(values)]
    } else {
      const raw = params.get(param) ?? (legacy ? params.get(legacy) : null)
      if (raw != null) (next as Record<string, unknown>)[key] = raw
    }
  }
  return next
}

/** Values that belong on harness tags, not Adaptation. */
const SCAFFOLD_EXTRA_METHODS = new Set(['skills', 'multi-agent', 'multiagent'])

export const defaultFilters = (version: string | 'all' = 'all'): FilterState => ({
  version,
  split: [],
  framework: [],
  llm_provider: [],
  model: [],
  optimization_method: [],
  tag: [],
  org: [],
  query: '',
})

/** True when a multi-value facet is unset or contains `value`. */
const allows = (chosen: string[], value: string | null | undefined) =>
  chosen.length === 0 || (value != null && chosen.includes(value))

/**
 * Filter options for Adaptation: only methods some submission actually used,
 * plus None. Offering a method nobody ran would be a filter that can only ever
 * return an empty table.
 */
export function adaptationFilterOptions(fromMeta: string[]): string[] {
  const fromData = fromMeta.filter(
    (m) => !SCAFFOLD_EXTRA_METHODS.has(m.trim().toLowerCase()),
  )
  return ['None', ...new Set(fromData)].sort((a, b) => {
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

/** Harness annotation tags (skills list, plus misfiled harness extras). */
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

/** Observed range of one score column, for shading cells by standing. */
export interface ScoreRange {
  min: number
  max: number
}

export function scoreRange(values: Array<number | null | undefined>): ScoreRange | null {
  const present = values.filter((v): v is number => v != null && !Number.isNaN(v))
  if (!present.length) return null
  return { min: Math.min(...present), max: Math.max(...present) }
}

/**
 * Labels are unique within a release, so a view spanning releases can repeat
 * one. Those repeats, and only those, gain the release as a final qualifier;
 * a single-release view keeps every label as generated.
 */
export function qualifyNames(rows: SubmissionSummary[]): SubmissionSummary[] {
  const counts = new Map<string, number>()
  for (const s of rows) counts.set(s.name, (counts.get(s.name) ?? 0) + 1)
  return rows.map((s) =>
    (counts.get(s.name) ?? 0) > 1
      ? { ...s, base_name: s.name, name: `${s.name} · v${s.benchmark_version}` }
      : s,
  )
}

/** The values one entry has for a multi-value facet. */
function facetValues(s: SubmissionSummary, key: MultiFilterKey): string[] {
  switch (key) {
    case 'llm_provider':
      return s.vendor?.id ? [s.vendor.id] : []
    case 'optimization_method': {
      const methods = adaptationMethods(s)
      return methods.length ? methods : ['None']
    }
    case 'tag':
      return s.tags || []
    case 'org':
      return [s.org || '']
    default: {
      const v = s[key]
      return v ? [v] : []
    }
  }
}

/**
 * How many entries each value of a facet would show, given every other
 * filter. A value missing here would empty the view, e.g. a model that has
 * no entries in the chosen release.
 */
export function facetCounts(
  rows: SubmissionSummary[],
  filters: FilterState,
  key: MultiFilterKey,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const s of applyFilters(rows, { ...filters, [key]: [] })) {
    for (const v of new Set(facetValues(s, key))) {
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
  }
  return counts
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
    // Values within one facet are alternatives; facets narrow each other.
    if (!allows(filters.split, s.split)) return false
    if (!allows(filters.framework, s.framework)) return false
    if (!allows(filters.llm_provider, s.vendor?.id)) return false
    if (!allows(filters.model, s.model)) return false
    if (filters.optimization_method.length) {
      const methods = adaptationMethods(s)
      const matches = filters.optimization_method.some((m) =>
        m === 'None' ? methods.length === 0 : methods.includes(m),
      )
      if (!matches) return false
    }
    if (
      filters.tag.length &&
      !filters.tag.some((t) => (s.tags || []).includes(t))
    ) {
      return false
    }
    if (!allows(filters.org, s.org || '')) return false
    if (q) {
      const hay = [
        s.name,
        s.authors,
        s.org,
        s.model,
        s.framework,
        s.llm_provider,
        s.vendor?.label,
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

/**
 * Consecutive rank among the visible rows of the same release.
 * Count how many visible same-release entries are significantly better
 * (`beaten_by`), then number those counts 1, 2, 3 so ties share a rank and
 * the next group is one higher. Ranks never compare across releases.
 */
export function withRanks(rows: SubmissionSummary[]): SubmissionSummary[] {
  const visible = new Set(rows.map((s) => s.id))
  const groups = new Map<string, SubmissionSummary[]>()
  for (const s of rows) {
    const key = `${s.benchmark_version}\0${s.split ?? ''}`
    const list = groups.get(key)
    if (list) list.push(s)
    else groups.set(key, [s])
  }
  const rankById = new Map<string, number>()
  for (const members of groups.values()) {
    const beaten = members.map(
      (s) => (s.beaten_by ?? []).filter((id) => visible.has(id)).length,
    )
    const levels = [...new Set(beaten)].sort((a, b) => a - b)
    const rankOf = new Map(levels.map((n, i) => [n, i + 1]))
    for (const [i, s] of members.entries()) {
      rankById.set(s.id, rankOf.get(beaten[i]) ?? 1)
    }
  }
  const ranked = rows.map((s) => ({
    ...s,
    rank: rankById.get(s.id) ?? 1,
  }))
  return ranked.sort((a, b) => {
    if (a.benchmark_version !== b.benchmark_version) {
      return b.benchmark_version.localeCompare(a.benchmark_version, undefined, {
        numeric: true,
      })
    }
    if (a.rank !== b.rank) return a.rank - b.rank
    const av = a.mean_rca_f1 ?? -1
    const bv = b.mean_rca_f1 ?? -1
    if (bv !== av) return bv - av
    return (a.name || '').localeCompare(b.name || '')
  })
}

/** How many visible rows share this row's rank (ties are ex aequo). */
export function tieCount(rows: SubmissionSummary[], s: SubmissionSummary): number {
  return rows.filter(
    (o) =>
      o.benchmark_version === s.benchmark_version &&
      o.split === s.split &&
      o.rank === s.rank,
  ).length
}

function roundOrNull(v: number | null): number | null {
  return v == null ? null : Math.round(v)
}

export function exportCsv(
  rows: SubmissionSummary[],
  filename: string,
  pricing: PricingFile | null = null,
  overrides: PriceOverrides = {},
  priceMode: PriceMode = 'frozen',
): void {
  // The leaderboard table's columns, optional ones included, with the same
  // figures: scores as shown, cost and tokens per task, entry-specific links.
  const columns: [string, (s: SubmissionSummary) => unknown][] = [
    ['rank', (s) => s.rank],
    ['tied', (s) => (s.rca_f1_ci && tieCount(rows, s) > 1 ? 'yes' : 'no')],
    ['release', (s) => s.benchmark_version],
    ['model', (s) => (s.model && s.reasoning_effort ? `${s.model} (${s.reasoning_effort})` : s.model)],
    ['verified', (s) => (s.official ? 'yes' : 'no')],
    ['model_released', (s) => modelReleaseDate(modelKey(s))?.toISOString().slice(0, 10)],
    ['harness', (s) => s.framework],
    ['harness_tags', (s) => scaffoldTags(s).join('; ')],
    ['agent_optimizations', (s) => adaptationMethods(s).join('; ')],
    ['user', (s) => s.authors?.trim() || 'anonymous'],
    ['rca_f1', (s) => s.mean_rca_f1],
    ['rca_f1_ci_low', (s) => s.rca_f1_ci?.[0]],
    ['rca_f1_ci_high', (s) => s.rca_f1_ci?.[1]],
    ['localization_f1', (s) => s.mean_localization_f1],
    ['detection', (s) => s.mean_detection_score],
    ['cost_per_task_usd', (s) => submissionCost(s, pricing, overrides, priceMode)?.perTask],
    [
      'cost_per_task_stat',
      (s) => submissionCost(s, pricing, overrides, priceMode)?.perTaskStat,
    ],
    ['input_tokens_per_task', (s) => roundOrNull(taskTokens(s, 'median', 'in_tokens'))],
    ['output_tokens_per_task', (s) => roundOrNull(taskTokens(s, 'median', 'out_tokens'))],
    ...(['trajectories', 'github', 'report', 'site'] as const).map(
      (kind): [string, (s: SubmissionSummary) => unknown] => [
        `${kind}_url`,
        (s) => entryLinks(s).find((l) => l.kind === kind)?.href,
      ],
    ),
  ]
  const lines = [columns.map(([h]) => h).join(',')]
  for (const s of rows) {
    const vals = columns.map(([, get]) => {
      const v = get(s)
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
