import { shortFailureCategory } from './compare'
import type { SubmissionDetail, TrialRow } from './types'

export const NONE_CATEGORY = 'none'

export interface ConfusionMatrix {
  categories: string[]
  /** counts[trueIndex][predIndex] */
  counts: number[][]
  /** Row-normalized rates (0–1); empty rows stay 0. */
  rates: number[][]
  /** Total trials contributing at least one matrix increment. */
  trialCount: number
  /** Trials with no predicted names counted under none. */
  emptyPredictionCount: number
}

export interface ConfusionPair {
  trueCategory: string
  predictedCategory: string
  count: number
  /** Share of that true-category row. */
  rate: number
  offDiagonal: boolean
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => {
    if (a === NONE_CATEGORY) return 1
    if (b === NONE_CATEGORY) return -1
    return a.localeCompare(b)
  })
}

/** Categories predicted for a trial; empty → [none]. */
export function predictedCategories(trial: TrialRow): string[] {
  const cats = trial.predicted_root_cause_categories
  if (cats && cats.length) return cats
  const names = trial.predicted_root_cause_names
  if (!names || !names.length) return [NONE_CATEGORY]
  // Names present but unmapped → treat as none for category matrix.
  return [NONE_CATEGORY]
}

export function buildCategoryConfusion(
  details: SubmissionDetail[],
): ConfusionMatrix {
  const trials = details.flatMap((d) => d.trials)
  const catSet = new Set<string>()
  for (const t of trials) {
    if (t.root_cause_category) catSet.add(t.root_cause_category)
    for (const c of predictedCategories(t)) catSet.add(c)
  }
  const usedNone = trials.some((t) =>
    predictedCategories(t).includes(NONE_CATEGORY),
  )
  if (!usedNone) catSet.delete(NONE_CATEGORY)

  const categories = uniqueSorted(catSet)
  const index = new Map(categories.map((c, i) => [c, i]))
  const n = categories.length
  const counts = Array.from({ length: n }, () => Array(n).fill(0))
  let trialCount = 0
  let emptyPredictionCount = 0

  for (const t of trials) {
    const trueCat = t.root_cause_category || 'unknown'
    if (!index.has(trueCat)) {
      // Skip if true cat somehow missing from axes (should not happen).
      continue
    }
    const preds = predictedCategories(t)
    if (preds.length === 1 && preds[0] === NONE_CATEGORY) {
      emptyPredictionCount += 1
    }
    const ti = index.get(trueCat)!
    const weight = 1 / preds.length
    for (const pred of preds) {
      const pi = index.get(pred)
      if (pi == null) continue
      counts[ti][pi] += weight
    }
    trialCount += 1
  }

  const rates = counts.map((row) => {
    const sum = row.reduce((a, b) => a + b, 0)
    if (sum <= 0) return row.map(() => 0)
    return row.map((v) => v / sum)
  })

  return { categories, counts, rates, trialCount, emptyPredictionCount }
}

export function topConfusionPairs(
  matrix: ConfusionMatrix,
  limit = 12,
  opts?: { offDiagonalOnly?: boolean },
): ConfusionPair[] {
  const offOnly = opts?.offDiagonalOnly ?? true
  const pairs: ConfusionPair[] = []
  const { categories, counts, rates } = matrix
  for (let i = 0; i < categories.length; i++) {
    for (let j = 0; j < categories.length; j++) {
      if (offOnly && i === j) continue
      const count = counts[i][j]
      if (count <= 0) continue
      pairs.push({
        trueCategory: categories[i],
        predictedCategory: categories[j],
        count,
        rate: rates[i][j],
        offDiagonal: i !== j,
      })
    }
  }
  pairs.sort((a, b) => b.count - a.count || b.rate - a.rate)
  return pairs.slice(0, limit)
}

export function categoryLabel(category: string): string {
  if (category === NONE_CATEGORY) return 'None'
  return shortFailureCategory(category)
}

export function hasUsablePredictions(details: SubmissionDetail[]): boolean {
  return details.some(
    (d) =>
      d.has_rca_predictions ||
      d.trials.some(
        (t) =>
          (t.predicted_root_cause_names &&
            t.predicted_root_cause_names.length > 0) ||
          (t.predicted_root_cause_categories &&
            t.predicted_root_cause_categories.length > 0) ||
          t.rca_prediction_source === 'synthetic' ||
          t.rca_prediction_source === 'enrichment' ||
          t.rca_prediction_source === 'packed',
      ),
  )
}

export function predictionSourceNote(details: SubmissionDetail[]): string | null {
  const sources = new Set(
    details.map((d) => d.rca_prediction_source).filter(Boolean),
  )
  if (sources.has('synthetic')) {
    return 'Mockup packages use synthetic predicted RCA names (deterministic from trial id + score) so this chart is demoable until packed predictions ship.'
  }
  if (sources.has('enrichment')) {
    return 'Predicted RCA names loaded from enrichment/rca_predictions sidecars.'
  }
  if (sources.has('packed')) {
    return 'Predicted RCA names taken from packed trial results.'
  }
  return null
}
