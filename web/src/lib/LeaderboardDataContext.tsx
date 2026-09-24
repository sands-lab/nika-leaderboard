import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadIndex, loadMeta, loadPricing } from './data'
import {
  applyFilters,
  defaultFilters,
  FILTER_PARAM_KEYS,
  filtersFromParams,
  filtersToParams,
} from './metrics'
import { loadOverrides, saveOverrides } from './pricing'
import type { PriceOverrides, PricingFile } from './pricing'
import type { FilterState, MetaFile, SubmissionSummary } from './types'

interface LeaderboardDataValue {
  submissions: SubmissionSummary[]
  meta: MetaFile | null
  filters: FilterState
  setFilters: (next: FilterState) => void
  filtered: SubmissionSummary[]
  /** Reference token prices, shared so every page costs runs identically. */
  pricing: PricingFile | null
  overrides: PriceOverrides
  setOverrides: (next: PriceOverrides) => void
  loading: boolean
  error: string | null
}

const LeaderboardDataContext = createContext<LeaderboardDataValue | null>(null)

export function LeaderboardDataProvider({ children }: { children: ReactNode }) {
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([])
  const [meta, setMeta] = useState<MetaFile | null>(null)
  const [params, setParams] = useSearchParams()
  // The load effect wants the URL as it was on arrival, not as it drifts.
  const initialParams = useRef(params)
  const [filters, setFiltersState] = useState<FilterState>(() =>
    filtersFromParams(params, defaultFilters()),
  )
  const [pricing, setPricing] = useState<PricingFile | null>(null)
  const [overrides, setOverridesState] = useState<PriceOverrides>(() =>
    loadOverrides(),
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [index, metaFile, priceFile] = await Promise.all([
          loadIndex(),
          loadMeta(),
          loadPricing(),
        ])
        if (cancelled) return
        setSubmissions(index.submissions)
        setMeta(metaFile)
        setPricing(priceFile)
        // Prefer the latest release that has submissions; else latest known version.
        const versionsWithData = [
          ...new Set(
            index.submissions
              .map((s) => s.benchmark_version)
              .filter((v): v is string => Boolean(v)),
          ),
        ].sort()
        const initialVersion =
          versionsWithData.length > 0
            ? versionsWithData[versionsWithData.length - 1]
            : metaFile.versions.length > 0
              ? metaFile.versions[metaFile.versions.length - 1]
              : 'all'
        // A release pinned in the URL wins over the newest-with-data default.
        setFiltersState(
          filtersFromParams(initialParams.current, defaultFilters(initialVersion)),
        )
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Filters live in the query string so a filtered view can be linked. */
  const setFilters = useCallback(
    (next: FilterState) => {
      setFiltersState(next)
      setParams(
        (prev) => {
          const merged = new URLSearchParams(prev)
          for (const key of FILTER_PARAM_KEYS) merged.delete(key)
          for (const [k, v] of filtersToParams(next)) merged.set(k, v)
          return merged
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setOverrides = useCallback((next: PriceOverrides) => {
    saveOverrides(next)
    setOverridesState(next)
  }, [])

  const filtered = useMemo(
    () => applyFilters(submissions, filters),
    [submissions, filters],
  )

  const value = useMemo(
    () => ({
      submissions,
      meta,
      filters,
      setFilters,
      filtered,
      pricing,
      overrides,
      setOverrides,
      loading,
      error,
    }),
    [
      submissions,
      meta,
      filters,
      setFilters,
      filtered,
      pricing,
      overrides,
      setOverrides,
      loading,
      error,
    ],
  )

  return (
    <LeaderboardDataContext.Provider value={value}>
      {children}
    </LeaderboardDataContext.Provider>
  )
}

export function useLeaderboardData(): LeaderboardDataValue {
  const ctx = useContext(LeaderboardDataContext)
  if (!ctx) {
    throw new Error('useLeaderboardData must be used within LeaderboardDataProvider')
  }
  return ctx
}
