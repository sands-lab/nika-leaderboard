import type {
  CatalogFile,
  LeaderboardIndex,
  MetaFile,
  SubmissionDetail,
  SubmissionSummary,
} from './types'

const detailCache = new Map<string, Promise<SubmissionDetail>>()

function dataUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  return `${normalized}data/${path.replace(/^\//, '')}`
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(dataUrl(path))
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function loadIndex(): Promise<LeaderboardIndex> {
  return fetchJson('index.json')
}

export function loadMeta(): Promise<MetaFile> {
  return fetchJson('meta.json')
}

export function loadCatalog(version: string): Promise<CatalogFile> {
  return fetchJson(`catalog/${version}.json`)
}

export function submissionDetailPath(id: string): string {
  return `submissions/${id.replace(/\//g, '__')}.json`
}

export function loadSubmissionDetail(id: string): Promise<SubmissionDetail> {
  const key = id
  let pending = detailCache.get(key)
  if (!pending) {
    pending = fetchJson(submissionDetailPath(id))
    detailCache.set(key, pending)
  }
  return pending
}

export async function loadSubmissionDetails(
  ids: string[],
): Promise<SubmissionDetail[]> {
  return Promise.all(ids.map((id) => loadSubmissionDetail(id)))
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatScore(value: number | null | undefined, digits = 3): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

export function formatInt(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return Math.round(value).toLocaleString()
}

/** Format submission timestamp for table display (UTC date + time). */
export function formatSubmittedAt(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    // Fallback: YYYYMMDD from package dirname prefix
    const m = value.match(/^(\d{4})(\d{2})(\d{2})/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    return value
  }
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`
}

export function primaryLink(s: SubmissionSummary): string | null {
  return s.github || s.site || s.report || null
}

export function dash(value: string | null | undefined): string {
  if (value == null || value === '') return '—'
  return value
}
