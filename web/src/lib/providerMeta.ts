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

/** Resolved provider slug: explicit metadata wins, else model inference. */
export function resolveProvider(
  llmProvider: string | null | undefined,
  model: string | null | undefined,
): string | null {
  if (llmProvider && llmProvider.trim()) {
    return normalizeProviderKey(llmProvider)
  }
  return inferProviderFromModel(model)
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
