/**
 * Public model release dates for the Released column and "Resolved vs model
 * release date".
 * Extend as new models appear on the leaderboard. Values are UTC midnight ISO dates.
 */
const MODEL_RELEASE_DATES: Record<string, string> = {
  'gpt-5': '2025-08-07',
  'gpt-5-mini': '2025-08-07',
  'gpt-5-nano': '2025-08-07',
  'gpt-4.1': '2025-04-14',
  'gpt-4o': '2024-05-13',
  'gpt-4o-mini': '2024-07-18',
  'gpt-oss:20b': '2025-08-05',
  'gpt-oss-20b': '2025-08-05',
  'o3': '2025-04-16',
  'o4-mini': '2025-04-16',
  'claude-opus-4': '2025-05-22',
  'claude-sonnet-4': '2025-05-22',
  'claude-3-5-sonnet': '2024-10-22',
  'claude-3-7-sonnet': '2025-02-24',
  'qwen3-235b': '2025-04-29',
  // Qwen3.5-27B dense: https://github.com/QwenLM/Qwen3.5 (2026-02-24)
  'qwen3.5-27b': '2026-02-24',
  // Qwen3.6-27B: https://qwen.ai/blog?id=qwen3.6-27b (2026-04-22)
  'qwen3.6-27b': '2026-04-22',
  // Qwen3.6-35B-A3B (MoE, open weights): announced by Tongyi Lab 2026-04-16
  'qwen3.6-35b-a3b': '2026-04-16',
  // First FP8 weight upload: https://huggingface.co/Qwen/Qwen3.8-27B-FP8/commit/10b09acb2fdc08d52017d17c1e3d42845fba3f4f
  'qwen3.8-27b-fp8': '2026-08-13',
  // First weight upload: https://huggingface.co/farbodtavakkoli/OTel-2.0-LLM-31B-IT/commit/2d474f02c3a4f8d98254c0574e0f085e8e19e1fc
  'otel-2.0-llm-31b-it': '2026-07-23',
  'deepseek-r1': '2025-01-20',
  'deepseek-v3': '2024-12-26',
}

/**
 * Official model pages (vendor docs or the weights' model card), keyed like
 * MODEL_RELEASE_DATES. A quantized checkpoint links to its own card.
 */
const MODEL_LINKS: Record<string, string> = {
  'gpt-5': 'https://developers.openai.com/api/docs/models/gpt-5',
  'gpt-5-mini': 'https://developers.openai.com/api/docs/models/gpt-5-mini',
  'gpt-oss-20b': 'https://huggingface.co/openai/gpt-oss-20b',
  'gpt-oss:20b': 'https://huggingface.co/openai/gpt-oss-20b',
  'qwen3.5-27b': 'https://huggingface.co/Qwen/Qwen3.5-27B',
  'qwen3.6-27b': 'https://huggingface.co/Qwen/Qwen3.6-27B',
  'qwen3.6-35b-a3b-fp8': 'https://huggingface.co/Qwen/Qwen3.6-35B-A3B-FP8',
  'qwen3.6-35b-a3b': 'https://huggingface.co/Qwen/Qwen3.6-35B-A3B',
  'qwen3.8-27b-fp8': 'https://huggingface.co/Qwen/Qwen3.8-27B-FP8',
  'otel-2.0-llm-31b-it': 'https://huggingface.co/farbodtavakkoli/OTel-2.0-LLM-31B-IT',
}

function normalizeModelKey(model: string): string {
  return model.trim().toLowerCase().replace(/_/g, '-')
}

/** Exact key first, then the longest table key the model name contains. */
function lookup<T>(table: Record<string, T>, model: string | null | undefined): T | null {
  if (!model) return null
  const key = normalizeModelKey(model)
  if (key in table) return table[key]
  // Variants like "gpt-5-2025-08-07" or provider prefixes. The longest match
  // wins so "gpt-5-mini-…" resolves to gpt-5-mini, not gpt-5.
  const hit = Object.keys(table)
    .filter((name) => key.includes(name) || name.includes(key))
    .sort((a, b) => b.length - a.length)[0]
  return hit ? table[hit] : null
}

/** Return model release date as Date, or null if unknown. */
export function modelReleaseDate(model: string | null | undefined): Date | null {
  const iso = lookup(MODEL_RELEASE_DATES, model)
  return iso ? new Date(`${iso}T00:00:00Z`) : null
}

/** Official page for the model, or null if none is on file. */
export function modelLink(model: string | null | undefined): string | null {
  return lookup(MODEL_LINKS, model)
}
