import type { SubmissionSummary } from './types'

/** How a model's reference price was arrived at. */
export type PriceBasis = 'api' | 'hosted_open_weight' | 'gpu_hour'

/** Rates that apply once a request's prompt reaches `min_prompt_tokens`. */
export interface PriceTier {
  min_prompt_tokens: number
  input: number
  output: number
  cache_read?: number
}

/** One dated price observation. Quotes are appended, never rewritten. */
export interface PriceQuote {
  /** USD per million input tokens. */
  input: number
  /** USD per million output tokens. */
  output: number
  source: string
  /** ISO date the quote was collected. */
  retrieved: string
  /** Aggregator the rates were read from, when not read by hand. */
  retrieved_via?: string
  cache_read?: number
  /** Recorded for reference; cost stays flat because packages carry token totals, not per-request prompt lengths. */
  tiers?: PriceTier[]
  note?: string
}

export interface ModelPricing {
  basis: PriceBasis
  provider?: string
  note?: string
  /** A curator confirmed no public quote exists. */
  status?: 'unavailable'
  quotes?: PriceQuote[]
}

export interface PricingFile {
  as_of: string
  currency: string
  unit: string
  notes?: string
  models: Record<string, ModelPricing>
}

/** The rate applied to a run: one quote with its model's basis and provider. */
export interface ModelPrice {
  /** USD per million input tokens. */
  input: number
  /** USD per million output tokens. */
  output: number
  basis: PriceBasis
  provider?: string
  source?: string
  /** ISO date the quote was collected; prices move, so citations need it. */
  retrieved?: string
  retrieved_via?: string
  tiers?: PriceTier[]
  note?: string
}

/**
 * `frozen` prices each run with the quote current at its package date, so a
 * published cost never moves. `current` re-prices every run at its model's
 * latest quote, for a like-for-like comparison across models.
 */
export type PriceMode = 'frozen' | 'current'

/**
 * Which per-task figure the analytics charts plot: the typical task, or the
 * expensive tail (the 95th percentile over the release's cases).
 */
export type TaskStat = 'median' | 'p95'

export const TASK_STAT_LABEL: Record<TaskStat, string> = {
  median: 'Median',
  p95: 'p95',
}

/** Why a run has, or lacks, a price. */
export type PriceStatus = 'priced' | 'pending' | 'unavailable'

/** "Claude Haiku 5.5" and "claude-haiku-5-5" name the same catalog entry. */
export function modelSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Catalog entry keyed by `model`'s runtime ID, whatever spelling the submitter used. */
export function catalogEntry<T>(table: Record<string, T> | null | undefined, model: string | null | undefined): T | null {
  if (!table || !model) return null
  if (model in table) return table[model]
  const slug = modelSlug(model)
  const key = Object.keys(table).find((k) => modelSlug(k) === slug)
  return key ? table[key] : null
}

/** What to look a run's model up by: its catalog key, else the name it was submitted under. */
export function modelKey(s: { model_id?: string | null; model: string | null }): string | null {
  return s.model_id ?? s.model
}

/** ISO date from a package directory's `YYYYMMDD_` prefix. */
export function packageDate(dirname: string | null | undefined): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})_/.exec(dirname ?? '')
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/**
 * Latest quote retrieved on or before `on`; the earliest when the model was
 * priced only after that date; the latest when no date is given.
 */
export function selectQuote(quotes: PriceQuote[] | undefined, on: string | null): PriceQuote | null {
  if (!quotes?.length) return null
  const ordered = [...quotes].sort((a, b) => a.retrieved.localeCompare(b.retrieved))
  if (!on) return ordered[ordered.length - 1]
  const eligible = ordered.filter((q) => q.retrieved <= on)
  return eligible.length ? eligible[eligible.length - 1] : ordered[0]
}

export function priceStatus(model: string | null, pricing: PricingFile | null): PriceStatus {
  const entry = catalogEntry(pricing?.models, model)
  if (entry?.status === 'unavailable') return 'unavailable'
  return entry?.quotes?.length ? 'priced' : 'pending'
}

/** User edits, keyed by model name, kept in this browser only. */
export type PriceOverrides = Record<string, { input: number; output: number }>

const STORAGE_KEY = 'nika.pricing.overrides.v1'

export function loadOverrides(): PriceOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: PriceOverrides = {}
    for (const [model, v] of Object.entries(parsed as Record<string, unknown>)) {
      const p = v as { input?: unknown; output?: unknown }
      if (typeof p?.input === 'number' && typeof p?.output === 'number') {
        out[model] = { input: p.input, output: p.output }
      }
    }
    return out
  } catch {
    return {}
  }
}

export function saveOverrides(overrides: PriceOverrides): void {
  try {
    if (Object.keys(overrides).length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // Private windows and blocked site data: the table still works this session.
  }
}

const MODE_KEY = 'nika.pricing.mode.v1'
const STAT_KEY = 'nika.pricing.task-stat.v1'

export function loadTaskStat(): TaskStat {
  try {
    return localStorage.getItem(STAT_KEY) === 'p95' ? 'p95' : 'median'
  } catch {
    return 'median'
  }
}

export function saveTaskStat(stat: TaskStat): void {
  try {
    if (stat === 'median') localStorage.removeItem(STAT_KEY)
    else localStorage.setItem(STAT_KEY, stat)
  } catch {
    // As with overrides: the choice still holds for this session.
  }
}

export function loadPriceMode(): PriceMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'current' ? 'current' : 'frozen'
  } catch {
    return 'frozen'
  }
}

export function savePriceMode(mode: PriceMode): void {
  try {
    if (mode === 'frozen') localStorage.removeItem(MODE_KEY)
    else localStorage.setItem(MODE_KEY, mode)
  } catch {
    // As with overrides: the choice still holds for this session.
  }
}

/**
 * Effective price for a model, with any local edit applied. `date` picks the
 * quote a run dated then is frozen at; without it, or in `current` mode, the
 * latest quote applies.
 */
export function priceFor(
  model: string | null,
  pricing: PricingFile | null,
  overrides: PriceOverrides,
  { date = null, mode = 'frozen' }: { date?: string | null; mode?: PriceMode } = {},
): ModelPrice | null {
  if (!model) return null
  const entry = catalogEntry(pricing?.models, model)
  const quote = selectQuote(entry?.quotes, mode === 'current' ? null : date)
  const base: ModelPrice | null =
    entry && quote
      ? {
          input: quote.input,
          output: quote.output,
          basis: entry.basis,
          provider: entry.provider,
          source: quote.source,
          retrieved: quote.retrieved,
          retrieved_via: quote.retrieved_via,
          tiers: quote.tiers,
          note: [entry.note, quote.note].filter(Boolean).join(' ') || undefined,
        }
      : null
  const edit = catalogEntry(overrides, model)
  if (!base && !edit) return null
  if (!edit) return base
  return {
    ...base,
    input: edit.input,
    output: edit.output,
    basis: base?.basis ?? entry?.basis ?? 'api',
  }
}

export interface SubmissionCost {
  /** USD for everything the package submitted, across all repeats. */
  total: number
  /**
   * USD for one complete pass over the benchmark's cases. This is the figure
   * people mean by "what does it cost to run this benchmark". It is scaled up
   * from the cost of a single attempt, so a package that did not finish every
   * designed trial is still quoted as a full pass rather than a cheap one.
   */
  perRun: number | null
  /** USD for a single case attempted once: the mean over every attempt. */
  perCase: number | null
  /**
   * USD for a typical task: the median over cases of each case's mean cost
   * across its repeats. Falls back to `perCase` when the package reports no
   * per-trial tokens; `perTaskStat` says which one applies.
   */
  perTask: number | null
  perTaskStat: 'median' | 'mean'
  /** 95th percentile of per-case cost; null without per-trial tokens. */
  perTaskP95: number | null
  price: ModelPrice
  /** True once the viewer has edited this model's price. */
  edited: boolean
}

/**
 * Monetary cost of a run from its token counts. Returns null when the package
 * reports no token accounting or the model has no price, so callers can leave a
 * gap rather than plot a zero.
 */
export function submissionCost(
  s: SubmissionSummary,
  pricing: PricingFile | null,
  overrides: PriceOverrides,
  mode: PriceMode = 'frozen',
): SubmissionCost | null {
  const price = priceFor(modelKey(s), pricing, overrides, {
    date: packageDate(s.dirname),
    mode,
  })
  if (!price) return null
  const inTok = s.token_totals?.in_tokens ?? 0
  const outTok = s.token_totals?.out_tokens ?? 0
  if (!(inTok > 0 || outTok > 0)) return null
  const total = (inTok * price.input + outTok * price.output) / 1_000_000
  // The token totals cover the trials the package actually reported, which can
  // be fewer than the design called for. Dividing by the designed count would
  // quote a truncated run as a cheap complete one, so the unit cost comes from
  // the trials that were paid for and a full pass is scaled up from it.
  const attempts = s.n_trials_present ?? s.n_trials_expected ?? 0
  const cases = s.case_count ?? 0
  const perCase = attempts > 0 ? total / attempts : null
  const taskCosts = (s.task_tokens ?? []).map(
    ([i, o]) => (i * price.input + o * price.output) / 1_000_000,
  )
  const medianTask = quantile(taskCosts, 0.5)
  return {
    total,
    perRun: perCase != null && cases > 0 ? perCase * cases : null,
    perCase,
    perTask: medianTask ?? perCase,
    perTaskStat: medianTask != null ? 'median' : 'mean',
    perTaskP95: quantile(taskCosts, 0.95),
    price,
    edited: Boolean(catalogEntry(overrides, modelKey(s))),
  }
}

/** Cost of one task under `stat`; the median may be the mean fallback. */
export function taskCost(cost: SubmissionCost | null, stat: TaskStat): number | null {
  if (!cost) return null
  return stat === 'p95' ? cost.perTaskP95 : cost.perTask
}

/** Which tokens to count: input, output, or both. */
export type TokenKind = 'in_tokens' | 'out_tokens' | 'all'

/**
 * Tokens of one task under `stat`, over the per-case means. Without per-trial
 * counts the median falls back to the mean per trial and p95 is null.
 */
export function taskTokens(
  s: SubmissionSummary,
  stat: TaskStat,
  kind: TokenKind = 'all',
): number | null {
  const pick = ([i, o]: [number, number]) =>
    kind === 'in_tokens' ? i : kind === 'out_tokens' ? o : i + o
  const values = (s.task_tokens ?? []).map(pick)
  if (values.length) return quantile(values, stat === 'p95' ? 0.95 : 0.5)
  return stat === 'median' ? meanTaskTokens(s, kind) : null
}

/** Mean tokens per trial, over the trials the package reported. */
export function meanTaskTokens(s: SubmissionSummary, kind: TokenKind = 'all'): number | null {
  const inTok = s.token_totals?.in_tokens ?? 0
  const outTok = s.token_totals?.out_tokens ?? 0
  const total = kind === 'in_tokens' ? inTok : kind === 'out_tokens' ? outTok : inTok + outTok
  const attempts = s.n_trials_present ?? s.n_trials_expected ?? 0
  return total > 0 && attempts > 0 ? total / attempts : null
}

/** Linearly interpolated quantile, as numpy's default; null for no values. */
export function quantile(values: number[], q: number): number | null {
  if (!values.length) return null
  const v = [...values].sort((a, b) => a - b)
  const pos = (v.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return v[lo] + (v[hi] - v[lo]) * (pos - lo)
}

/** $0.0042 -> "$0.0042", $1.37 -> "$1.37", $1234 -> "$1,234". */
export function formatUsd(value: number): string {
  if (value === 0) return '$0'
  const digits = value < 0.01 ? 4 : value < 1 ? 3 : value < 100 ? 2 : 0
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

export const BASIS_LABEL: Record<PriceBasis, string> = {
  api: 'vendor API list price',
  hosted_open_weight: 'hosted quote for the same open weights',
  gpu_hour: 'derived from GPU rental and throughput',
}

const BASIS_GROUP: Record<PriceBasis, string> = {
  api: 'Proprietary models: vendor API list prices',
  hosted_open_weight: 'Open-weight models: public hosted-inference quotes',
  gpu_hour: 'Other models: GPU rental and throughput estimates',
}

/**
 * Where the reference prices come from, one line per basis, naming the
 * providers quoted (most-used first). Read from the pricing file so the
 * explanation cannot drift from the prices actually applied.
 */
export function priceSourceLines(pricing: PricingFile | null): string[] {
  if (!pricing) return []
  const byBasis = new Map<PriceBasis, Map<string, number>>()
  for (const p of Object.values(pricing.models)) {
    if (!p.quotes?.length) continue
    const counts = byBasis.get(p.basis) ?? new Map<string, number>()
    if (p.provider) counts.set(p.provider, (counts.get(p.provider) ?? 0) + 1)
    byBasis.set(p.basis, counts)
  }
  return (Object.keys(BASIS_GROUP) as PriceBasis[])
    .filter((basis) => byBasis.has(basis))
    .map((basis) => {
      const providers = [...byBasis.get(basis)!.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name]) => name)
      return providers.length
        ? `${BASIS_GROUP[basis]} (${providers.join(', ')})`
        : BASIS_GROUP[basis]
    })
}
