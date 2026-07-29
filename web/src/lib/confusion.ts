import { shortFailureCategory } from './compare'
import type { SubmissionDetail, TrialRow } from './types'

export type ConfusionLevel = 'category' | 'problem'

export interface ConfusionMatrix {
  labels: string[]
  /** counts[trueIndex][predIndex] — multi-label GT×pred edge counts */
  counts: number[][]
  /** Row-normalized rates (0–1); empty rows stay 0. */
  rates: number[][]
  /** Trials that contributed at least one edge. */
  trialCount: number
  /** Trials with predicted_root_cause_name == null (or empty). */
  missingPredictionCount: number
  /** Total multi-label edges. */
  edgeCount: number
}

export interface ConfusionPair {
  trueLabel: string
  predictedLabel: string
  count: number
  /** Share of that true-label row. */
  rate: number
  offDiagonal: boolean
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function mergeNameCategoryMap(details: SubmissionDetail[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const d of details) {
    const block = d.name_to_category
    if (block) {
      for (const [name, cat] of Object.entries(block)) {
        if (name && cat) map.set(name, cat)
      }
    }
    for (const t of d.trials) {
      if (t.problem && t.root_cause_category) {
        map.set(t.problem, t.root_cause_category)
      }
      for (const name of t.gt_root_cause_name || []) {
        if (t.root_cause_category) map.set(name, t.root_cause_category)
      }
      const preds = t.predicted_root_cause_name ?? t.predicted_root_cause_names
      if (preds?.length === 1 && t.predicted_root_cause_categories?.[0]) {
        map.set(preds[0], t.predicted_root_cause_categories[0])
      }
    }
  }
  return map
}

function trialGtNames(trial: TrialRow): string[] {
  if (trial.gt_root_cause_name?.length) return trial.gt_root_cause_name
  return trial.problem ? [trial.problem] : []
}

function trialPredNames(trial: TrialRow): string[] | null {
  const names =
    trial.predicted_root_cause_name ?? trial.predicted_root_cause_names
  if (names == null) return null
  if (!names.length) return null
  return names
}

function projectLabel(
  name: string,
  level: ConfusionLevel,
  nameToCat: Map<string, string>,
): string {
  if (level === 'problem') return name
  return nameToCat.get(name) || 'unknown'
}

/**
 * Multi-label edge confusion (matches NIKA `build_rca_confusion`).
 * Each (gt_name, pred_name) edge counts once; optional projection to categories.
 */
export function buildConfusionMatrix(
  details: SubmissionDetail[],
  level: ConfusionLevel = 'category',
): ConfusionMatrix {
  const nameToCat = mergeNameCategoryMap(details)
  const labelSet = new Set<string>()
  const edgeList: Array<[string, string]> = []
  let trialCount = 0
  let missingPredictionCount = 0

  for (const d of details) {
    for (const t of d.trials) {
      const preds = trialPredNames(t)
      if (preds === null) {
        missingPredictionCount += 1
        continue
      }
      const gts = trialGtNames(t)
      if (!gts.length) continue
      trialCount += 1
      for (const g of gts) {
        const gi = projectLabel(g, level, nameToCat)
        for (const p of preds) {
          const pi = projectLabel(p, level, nameToCat)
          labelSet.add(gi)
          labelSet.add(pi)
          edgeList.push([gi, pi])
        }
      }
    }
  }

  const labels = uniqueSorted(labelSet)
  const index = new Map(labels.map((c, i) => [c, i]))
  const n = labels.length
  const counts = Array.from({ length: n }, () => Array(n).fill(0))
  for (const [g, p] of edgeList) {
    const ti = index.get(g)
    const pi = index.get(p)
    if (ti == null || pi == null) continue
    counts[ti][pi] += 1
  }

  const rates = counts.map((row) => {
    const sum = row.reduce((a, b) => a + b, 0)
    if (sum <= 0) return row.map(() => 0)
    return row.map((v) => v / sum)
  })

  return {
    labels,
    counts,
    rates,
    trialCount,
    missingPredictionCount,
    edgeCount: edgeList.length,
  }
}

export function buildCategoryConfusion(
  details: SubmissionDetail[],
): ConfusionMatrix {
  return buildConfusionMatrix(details, 'category')
}

export function topConfusionPairs(
  matrix: ConfusionMatrix,
  limit = 12,
  opts?: { offDiagonalOnly?: boolean },
): ConfusionPair[] {
  const offOnly = opts?.offDiagonalOnly ?? true
  const pairs: ConfusionPair[] = []
  const { labels, counts, rates } = matrix
  for (let i = 0; i < labels.length; i++) {
    for (let j = 0; j < labels.length; j++) {
      if (offOnly && i === j) continue
      const count = counts[i][j]
      if (count <= 0) continue
      pairs.push({
        trueLabel: labels[i],
        predictedLabel: labels[j],
        count,
        rate: rates[i][j],
        offDiagonal: i !== j,
      })
    }
  }
  pairs.sort((a, b) => b.count - a.count || b.rate - a.rate)
  return pairs.slice(0, limit)
}

export function axisLabel(label: string, level: ConfusionLevel): string {
  if (level === 'category') return shortFailureCategory(label)
  return label
}

export function categoryLabel(category: string): string {
  return axisLabel(category, 'category')
}

export function hasUsablePredictions(details: SubmissionDetail[]): boolean {
  return details.some(
    (d) =>
      (d.rca_confusion?.pairs?.length ?? 0) > 0 ||
      d.trials.some((t) => {
        const names =
          t.predicted_root_cause_name ?? t.predicted_root_cause_names
        return (names?.length ?? 0) > 0
      }),
  )
}
