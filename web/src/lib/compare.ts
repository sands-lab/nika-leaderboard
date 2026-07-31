import type { SubmissionDetail, TrialRow } from './types'

export interface CaseAggregate {
  case_key: string
  scenario: string
  problem: string
  topo_size: string | null
  root_cause_category: string | null
  mean_rca_f1: number
  success_rate: number
  n_trials: number
  mean_tokens: number | null
  mean_steps: number | null
}

export function aggregateByCase(trials: TrialRow[]): CaseAggregate[] {
  const map = new Map<string, TrialRow[]>()
  for (const t of trials) {
    const key = t.case_key || `${t.scenario}__${t.problem}`
    const list = map.get(key) || []
    list.push(t)
    map.set(key, list)
  }
  const out: CaseAggregate[] = []
  for (const [case_key, group] of map) {
    const n = group.length
    const mean_rca_f1 = group.reduce((s, t) => s + (t.rca_f1 || 0), 0) / n
    const success_rate =
      group.filter((t) => t.outcome === 'success').length / n
    const tokenVals = group
      .map((t) => (t.in_tokens || 0) + (t.out_tokens || 0))
      .filter((v) => v > 0)
    const stepVals = group.map((t) => t.steps || 0).filter((v) => v > 0)
    out.push({
      case_key,
      scenario: group[0].scenario,
      problem: group[0].problem,
      topo_size: group[0].topo_size,
      root_cause_category: group[0].root_cause_category,
      mean_rca_f1,
      success_rate,
      n_trials: n,
      mean_tokens: tokenVals.length
        ? tokenVals.reduce((a, b) => a + b, 0) / tokenVals.length
        : null,
      mean_steps: stepVals.length
        ? stepVals.reduce((a, b) => a + b, 0) / stepVals.length
        : null,
    })
  }
  return out
}

export interface PairwiseResult {
  aId: string
  bId: string
  aName: string
  bName: string
  aWins: number
  bWins: number
  ties: number
  compared: number
  rows: Array<{
    case_key: string
    scenario: string
    problem: string
    a_rca: number
    b_rca: number
    delta: number
    winner: 'a' | 'b' | 'tie'
  }>
}

export function pairwiseCompare(
  a: SubmissionDetail,
  b: SubmissionDetail,
): PairwiseResult {
  const aCases = new Map(aggregateByCase(a.trials).map((c) => [c.case_key, c]))
  const bCases = new Map(aggregateByCase(b.trials).map((c) => [c.case_key, c]))
  const keys = [...aCases.keys()].filter((k) => bCases.has(k)).sort()
  let aWins = 0
  let bWins = 0
  let ties = 0
  const rows: PairwiseResult['rows'] = []
  for (const key of keys) {
    const ac = aCases.get(key)!
    const bc = bCases.get(key)!
    const delta = ac.mean_rca_f1 - bc.mean_rca_f1
    let winner: 'a' | 'b' | 'tie' = 'tie'
    if (Math.abs(delta) < 1e-9) {
      ties += 1
      winner = 'tie'
    } else if (delta > 0) {
      aWins += 1
      winner = 'a'
    } else {
      bWins += 1
      winner = 'b'
    }
    rows.push({
      case_key: key,
      scenario: ac.scenario,
      problem: ac.problem,
      a_rca: ac.mean_rca_f1,
      b_rca: bc.mean_rca_f1,
      delta,
      winner,
    })
  }
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
  return {
    aId: a.id,
    bId: b.id,
    aName: a.name,
    bName: b.name,
    aWins,
    bWins,
    ties,
    compared: keys.length,
    rows,
  }
}

export function cdfPoints(values: number[]): Array<[number, number]> {
  if (!values.length) return []
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  return sorted.map((v, i) => [v, (i + 1) / n])
}

export function groupMean(
  trials: TrialRow[],
  keyFn: (t: TrialRow) => string,
): Array<{ key: string; mean: number; n: number }> {
  const map = new Map<string, number[]>()
  for (const t of trials) {
    const k = keyFn(t) || 'unknown'
    const list = map.get(k) || []
    list.push(t.rca_f1 || 0)
    map.set(k, list)
  }
  return [...map.entries()]
    .map(([key, vals]) => ({
      key,
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
      n: vals.length,
    }))
    .sort((a, b) => b.mean - a.mean)
}

/** Short axis labels for polar/radial failure-category charts. */
export const FAILURE_CATEGORY_SHORT: Record<string, string> = {
  link_failure: 'Link',
  end_host_failure: 'Host',
  network_node_error: 'Node',
  resource_contention: 'Resource',
  misconfiguration: 'Misconfig',
  network_under_attack: 'Attack',
  multiple_faults: 'Multi',
  unknown: 'Unknown',
}

export function shortFailureCategory(category: string): string {
  if (FAILURE_CATEGORY_SHORT[category]) return FAILURE_CATEGORY_SHORT[category]
  // fallback: last snake segment, title-ish
  const parts = category.split('_').filter(Boolean)
  if (!parts.length) return category
  if (parts.length === 1) return parts[0].slice(0, 10)
  return parts[parts.length - 1].slice(0, 10)
}

export function radarAxes(detail: SubmissionDetail) {
  const tokens = detail.mean_tokens ?? 0
  const steps = detail.mean_steps ?? 0
  // Invert cost so higher is better; normalize later across selection.
  return {
    detection: detail.mean_detection_score ?? 0,
    localization: detail.mean_localization_f1 ?? 0,
    rca: detail.mean_rca_f1 ?? 0,
    success: detail.success_rate ?? 0,
    tokens,
    steps,
  }
}

export interface CostScorePoint {
  id: string
  name: string
  /** Cost proxy (e.g. total tokens). */
  cost: number
  /** Quality score (e.g. mean RCA F1). */
  score: number
}

/**
 * Pareto frontier for minimize-cost / maximize-score.
 * Walk cost ascending; keep points that strictly improve best score so far.
 */
export function paretoFront(points: CostScorePoint[]): CostScorePoint[] {
  const sorted = [...points].sort(
    (a, b) => a.cost - b.cost || b.score - a.score,
  )
  const front: CostScorePoint[] = []
  let bestScore = -Infinity
  for (const p of sorted) {
    if (p.score > bestScore) {
      front.push(p)
      bestScore = p.score
    }
  }
  return front
}
