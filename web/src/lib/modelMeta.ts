/**
 * Approximate public model release dates for "Resolved vs model release date".
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
  'qwen3.5-27b': '2025-09-01',
  'qwen3.6-27b': '2025-11-01',
  'deepseek-r1': '2025-01-20',
  'deepseek-v3': '2024-12-26',
}

function normalizeModelKey(model: string): string {
  return model.trim().toLowerCase().replace(/_/g, '-')
}

/** Return model release date as Date, or null if unknown. */
export function modelReleaseDate(model: string | null | undefined): Date | null {
  if (!model) return null
  const key = normalizeModelKey(model)
  const direct = MODEL_RELEASE_DATES[key]
  if (direct) return new Date(`${direct}T00:00:00Z`)
  // Prefix match for variants like "gpt-5-2025-08-07" or provider prefixes
  for (const [name, iso] of Object.entries(MODEL_RELEASE_DATES)) {
    if (key.includes(name) || name.includes(key)) {
      return new Date(`${iso}T00:00:00Z`)
    }
  }
  return null
}
