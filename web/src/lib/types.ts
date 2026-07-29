export interface TokenTotals {
  in_tokens?: number | null
  out_tokens?: number | null
}

export interface StepsTotals {
  steps?: number | null
  tool_calls?: number | null
  tool_errors?: number | null
}

export interface SubmissionSummary {
  id: string
  dirname: string
  rank?: number
  name: string
  authors: string
  org: string | null
  site: string | null
  report: string | null
  logo: string | null
  github: string | null
  email: string | null
  model: string | null
  framework: string | null
  agent_type: string | null
  llm_provider: string | null
  tools: string[]
  skills: string[]
  optimization_methods: string[]
  tags: string[]
  os_model: boolean
  os_system: boolean
  benchmark_version: string
  split: string | null
  case_count: number | null
  n_trials: number | null
  primary_metric: string
  mean_rca_f1: number | null
  mean_localization_f1: number | null
  mean_detection_score: number | null
  n_trials_expected: number
  n_trials_present: number | null
  n_success: number
  n_agent_failed: number | null
  success_rate: number
  token_totals: TokenTotals
  steps_totals: StepsTotals
  /** Mean (in+out) tokens per expected trial. */
  mean_tokens: number | null
  /** Mean steps per expected trial. */
  mean_steps: number | null
  /** Total in+out tokens across the run. */
  total_tokens: number | null
  max_steps: number | null
  case_timeout_sec: number | null
  /** Package identity created_at (ISO-8601). */
  created_at: string | null
  run_id: string | null
  official: boolean | null
  /** How predicted RCA names were obtained for this package. */
  rca_prediction_source?: 'packed' | 'enrichment' | 'synthetic' | 'none' | null
  has_rca_predictions?: boolean
}

export interface TrialRow {
  trial_id: string
  case_key: string
  trial_index: number
  scenario: string
  problem: string
  outcome: string
  topo_size: string | null
  root_cause_category: string | null
  detection_score: number
  localization_f1: number
  rca_f1: number
  in_tokens: number | null
  out_tokens: number | null
  steps: number | null
  tool_calls: number | null
  tool_errors: number | null
  /** Gold problem names predicted by the agent (multi-label). */
  predicted_root_cause_names?: string[]
  /** Categories derived from predicted names via catalog. */
  predicted_root_cause_categories?: string[]
  rca_prediction_source?: 'packed' | 'enrichment' | 'synthetic' | 'none'
}

export interface SubmissionDetail extends SubmissionSummary {
  trials: TrialRow[]
}

export interface LeaderboardIndex {
  submissions: SubmissionSummary[]
}

export interface MetaFilters {
  framework: string[]
  llm_provider: string[]
  model: string[]
  optimization_methods: string[]
  tags: string[]
  org: string[]
  split: string[]
}

export interface MetaFile {
  versions: string[]
  filters: MetaFilters
  primary_metric: string
}

export interface CatalogCase {
  scenario: string
  problem: string
  topo_size: string | null
  root_cause_category: string | null
  split: string
}

export interface CatalogFile {
  version: string
  by_scenario_problem: Record<
    string,
    {
      topo_size: string | null
      root_cause_category: string | null
      split: string
    }
  >
  categories: string[]
  problems: string[]
  cases: CatalogCase[]
}

export interface FilterState {
  version: string | 'all'
  split: string | 'all'
  framework: string | 'all'
  llm_provider: string | 'all'
  model: string | 'all'
  optimization_method: string | 'all'
  tag: string | 'all'
  org: string | 'all'
  os_model: 'all' | 'true' | 'false'
  os_system: 'all' | 'true' | 'false'
  query: string
}
