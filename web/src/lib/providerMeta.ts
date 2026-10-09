/**
 * LLM provider display helpers (icons + inference from model names).
 * Icons live under `public/providers/`.
 */

export type KnownProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'qwen'
  | 'meta'
  | 'mistral'

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  meta: 'Meta',
  mistral: 'Mistral',
}

const PROVIDER_ICONS: Record<string, string> = {
  openai: 'providers/openai.svg',
  anthropic: 'providers/anthropic.svg',
  google: 'providers/google.svg',
  deepseek: 'providers/deepseek.svg',
  qwen: 'providers/qwen.svg',
}

function normalizeProviderKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-')
}

/** Infer provider slug from a model id when metadata omits llm_provider. */
export function inferProviderFromModel(
  model: string | null | undefined,
): string | null {
  if (!model) return null
  const key = normalizeProviderKey(model)

  if (
    key.startsWith('gpt-') ||
    key.startsWith('gpt') ||
    key.startsWith('o1') ||
    key.startsWith('o3') ||
    key.startsWith('o4') ||
    key.includes('gpt-oss')
  ) {
    return 'openai'
  }
  if (key.includes('claude')) return 'anthropic'
  if (key.includes('gemini') || key.includes('gemma')) return 'google'
  if (key.includes('deepseek')) return 'deepseek'
  if (key.includes('qwen')) return 'qwen'
  if (key.includes('llama') || key.startsWith('meta-')) return 'meta'
  if (key.includes('mistral') || key.includes('mixtral')) return 'mistral'
  return null
}

/**
 * Resolved model vendor: a known vendor in the metadata wins, else model
 * inference. NIKA's `custom` provider names the serving route (an
 * OpenAI-compatible base_url), not who made the model, so it falls through to
 * the model name like any other unrecognized value.
 */
export function resolveProvider(
  llmProvider: string | null | undefined,
  model: string | null | undefined,
): string | null {
  const explicit = llmProvider?.trim() ? normalizeProviderKey(llmProvider) : null
  if (explicit && explicit in PROVIDER_LABELS) return explicit
  return inferProviderFromModel(model) ?? explicit
}

/**
 * How the run reached the model, only where the package states it. A vendor
 * slug may have been inferred from the model name at build time, so it says
 * nothing about serving; only NIKA's `custom` provider does.
 */
export function servingLabel(llmProvider: string | null | undefined): string | null {
  if (!llmProvider?.trim()) return null
  return normalizeProviderKey(llmProvider) === 'custom'
    ? 'Self-hosted (OpenAI-compatible endpoint)'
    : null
}

export function providerDisplayName(provider: string | null | undefined): string {
  if (!provider) return '—'
  const key = normalizeProviderKey(provider)
  return PROVIDER_LABELS[key] || provider
}

export function providerIconSrc(provider: string | null | undefined): string | null {
  if (!provider) return null
  const key = normalizeProviderKey(provider)
  const rel = PROVIDER_ICONS[key]
  if (!rel) return null
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  return `${normalized}${rel}`
}
