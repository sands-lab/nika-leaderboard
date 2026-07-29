import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { loadIndex, loadMeta } from './data'
import { applyFilters, defaultFilters } from './metrics'
import type { FilterState, MetaFile, SubmissionSummary } from './types'

interface LeaderboardDataValue {
  submissions: SubmissionSummary[]
  meta: MetaFile | null
  filters: FilterState
  setFilters: (next: FilterState) => void
  filtered: SubmissionSummary[]
  loading: boolean
  error: string | null
}

const LeaderboardDataContext = createContext<LeaderboardDataValue | null>(null)

export function LeaderboardDataProvider({ children }: { children: ReactNode }) {
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([])
  const [meta, setMeta] = useState<MetaFile | null>(null)
  const [filters, setFilters] = useState<FilterState>(defaultFilters())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [index, metaFile] = await Promise.all([loadIndex(), loadMeta()])
        if (cancelled) return
        setSubmissions(index.submissions)
        setMeta(metaFile)
        const initialVersion =
          metaFile.versions.length === 1 ? metaFile.versions[0] : 'all'
        setFilters(defaultFilters(initialVersion))
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
      loading,
      error,
    }),
    [submissions, meta, filters, filtered, loading, error],
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
