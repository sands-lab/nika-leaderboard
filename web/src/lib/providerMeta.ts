/**
 * Vendor display helpers. The data build decides who made each model and
 * which label and icon to show (see `scripts/vendors.py`); icons live under
 * `public/providers/`.
 */

/** Site URL for a vendor icon path from the data files. */
export function vendorIconSrc(icon: string | null | undefined): string | null {
  if (!icon) return null
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  return `${normalized}providers/${icon}`
}

/**
 * How the run reached the model, only where the package states it. Only
 * NIKA's `custom` provider says anything about serving.
 */
export function servingLabel(llmProvider: string | null | undefined): string | null {
  if (!llmProvider?.trim()) return null
  return llmProvider.trim().toLowerCase() === 'custom'
    ? 'Self-hosted (OpenAI-compatible endpoint)'
    : null
}
