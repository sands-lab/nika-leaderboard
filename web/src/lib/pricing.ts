import type { SubmissionSummary } from './types'

/** How a model's reference price was arrived at. */
export type PriceBasis = 'api' | 'hosted_open_weight' | 'gpu_hour'

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
  note?: string
}

export interface PricingFile {
  as_of: string
  currency: string
  unit: string
  notes?: string
  models: Record<string, ModelPrice>
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

/** Effective price for a model, with any local edit applied. */
export function priceFor(
  model: string | null,
  pricing: PricingFile | null,
  overrides: PriceOverrides,
): ModelPrice | null {
  if (!model) return null
  const base = pricing?.models?.[model] ?? null
  const edit = overrides[model]
  if (!base && !edit) return null
  if (!edit) return base
  return {
    input: edit.input,
    output: edit.output,
    basis: base?.basis ?? 'api',
    provider: base?.provider,
    source: base?.source,
    retrieved: base?.retrieved,
    note: base?.note,
  }
}

export interface SubmissionCost {
  /** USD for the whole run. */
  total: number
  /** USD per expected trial. */
  perTrial: number | null
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
): SubmissionCost | null {
  const price = priceFor(s.model, pricing, overrides)
  if (!price) return null
  const inTok = s.token_totals?.in_tokens ?? 0
  const outTok = s.token_totals?.out_tokens ?? 0
  if (!(inTok > 0 || outTok > 0)) return null
  const total = (inTok * price.input + outTok * price.output) / 1_000_000
  const trials = s.n_trials_expected || 0
  return {
    total,
    perTrial: trials > 0 ? total / trials : null,
    price,
    edited: Boolean(overrides[s.model ?? '']),
  }
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
