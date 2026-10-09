import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { EntryLinks, LinkIcon } from '../components/EntryLinks'
import {
  HarnessCell,
  ProviderIcon,
  RcaCell,
  ScorePill,
  VerifiedMark,
} from '../components/LeaderboardTable'
import {
  entryLinks,
  formatCount,
  formatDateUtc,
  formatInt,
  formatPct,
  loadSubmissionDetail,
} from '../lib/data'
import { useLeaderboardData } from '../lib/LeaderboardDataContext'
import { formatAdaptation, scaffoldTags, tieCount, withRanks } from '../lib/metrics'
import { modelLink, modelReleaseDate } from '../lib/modelMeta'
import { BASIS_LABEL, formatUsd, submissionCost } from '../lib/pricing'
import { providerDisplayName, resolveProvider, servingLabel } from '../lib/providerMeta'
import type { SubmissionSummary } from '../lib/types'

const NIKA_REPO = 'https://github.com/sands-lab/nika'
const ARCHIVE_REPO = 'https://github.com/sands-lab/nika-leaderboard'

type Row = [label: string, value: ReactNode]

/** A titled list of label/value pairs; rows with no value are left out. */
function Facts({ title, rows }: { title: string; rows: Row[] }) {
  const shown = rows.filter(([, v]) => v != null && v !== '' && v !== false)
  if (shown.length === 0) return null
  return (
    <section className="entry-facts">
      <h2>{title}</h2>
      <dl>
        {shown.map(([label, value]) => (
          <div key={label} className="entry-facts__row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="entry-stat">
      <span className="entry-stat__label">{label}</span>
      <span className="entry-stat__value">{children}</span>
    </div>
  )
}

function list(values: string[] | null | undefined): string | null {
  return values && values.length > 0 ? values.join(', ') : null
}

function seconds(value: number | null | undefined): string | null {
  if (value == null) return null
  return value >= 120 ? `${formatInt(value)} s (${Math.round(value / 60)} min)` : `${value} s`
}

/**
 * The package README as plain blocks. Its title repeats the page heading, so it
 * is dropped; bullets become a list. Text only: nothing is parsed as HTML.
 */
function Readme({ text }: { text: string }) {
  const blocks = text
    .replace(/^#\s+.*\n?/, '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  if (blocks.length === 0) return null
  return (
    <section className="entry-facts entry-readme">
      <h2>Notes from the submitter</h2>
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        if (lines.every((l) => /^[-*]\s/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^[-*]\s+/, '')}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{block.replace(/^#+\s+/, '')}</p>
      })}
    </section>
  )
}

function extraRows(s: SubmissionSummary): Row[] {
  return Object.entries(s.extra ?? {}).map(([k, v]) => [
    k,
    typeof v === 'string' ? v : JSON.stringify(v),
  ])
}

export function EntryPage() {
  const { version = '', dirname = '' } = useParams()
  const { search } = useLocation()
  const { submissions, pricing, overrides, loading, error } = useLeaderboardData()
  const id = `${version}/${dirname}`
  const [readme, setReadme] = useState<string | null>(null)

  // Rank among the whole release, not the filtered table the visitor came from.
  const release = useMemo(
    () => withRanks(submissions.filter((s) => s.benchmark_version === version)),
    [submissions, version],
  )
  const s = release.find((r) => r.id === id)

  useEffect(() => {
    let cancelled = false
    setReadme(null)
    if (!s) return
    loadSubmissionDetail(s.id)
      .then((d) => {
        if (!cancelled) setReadme(d.readme ?? null)
      })
      .catch(() => {
        // The summary already covers the page; the README is optional.
      })
    return () => {
      cancelled = true
    }
  }, [s])

  const back = (
    <Link className="entry-back" to={{ pathname: '/', search }}>
      ← Leaderboard
    </Link>
  )

  if (loading) return <p className="status">Loading entry…</p>
  if (error) return <p className="status status--error">{error}</p>
  if (!s) {
    return (
      <div className="page entry-page">
        {back}
        <p className="status">No entry {id} in the archive.</p>
      </div>
    )
  }

  const cost = submissionCost(s, pricing, overrides)
  const price = cost?.price ?? pricing?.models?.[s.model ?? ''] ?? null
  const vendor = resolveProvider(s.llm_provider, s.model)
  const modelUrl = modelLink(s.model)
  const tied = tieCount(release, s)
  const inTok = s.token_totals?.in_tokens ?? 0
  const outTok = s.token_totals?.out_tokens ?? 0
  const hasTokens = inTok > 0 || outTok > 0
  const links = entryLinks(s)

  return (
    <div className="page entry-page">
      {back}

      <header className="entry-head">
        <div>
          <h1>
            {s.model ?? s.name}
            <VerifiedMark official={s.official} />
          </h1>
          <p className="lede">
            {s.name} · NIKA {s.benchmark_version}
            {s.split ? ` ${s.split} split` : ''}
          </p>
        </div>
        {links.length > 0 && <EntryLinks links={links} />}
      </header>

      <div className="entry-stats">
        <Stat label="Rank">
          {s.rank}
          {s.rca_f1_ci && tied > 1 && <span className="rank-tie">=</span>}
          <small> of {release.length}</small>
        </Stat>
        <Stat label="RCA F1">
          <RcaCell s={s} />
        </Stat>
        <Stat label="Loc F1">
          <ScorePill value={s.mean_localization_f1} />
        </Stat>
        <Stat label="Detection">
          <ScorePill value={s.mean_detection_score} />
        </Stat>
        <Stat label="Cost / run">
          {cost?.perRun != null ? formatUsd(cost.perRun) : '—'}
        </Stat>
      </div>

      <div className="entry-grid">
        <Facts
          title="Model"
          rows={[
            [
              'Model',
              <span className="entry-inline">
                {s.model ?? '—'}
                {modelUrl && (
                  <LinkIcon link={{ kind: 'model', label: 'Model page', href: modelUrl }} />
                )}
              </span>,
            ],
            [
              'Vendor',
              vendor && (
                <span className="entry-inline">
                  <ProviderIcon llmProvider={s.llm_provider} model={s.model} />
                  {providerDisplayName(vendor)}
                </span>
              ),
            ],
            ['Released', modelReleaseDate(s.model) && formatDateUtc(modelReleaseDate(s.model))],
            ['Served via', servingLabel(s.llm_provider)],
            [
              'Reference price',
              price && (
                <span>
                  {formatUsd(price.input)} in / {formatUsd(price.output)} out per 1M tokens
                  <small className="entry-sub">
                    {cost?.edited ? 'edited in this browser' : BASIS_LABEL[price.basis]}
                    {price.provider ? ` · ${price.provider}` : ''}
                    {price.retrieved ? ` · retrieved ${price.retrieved}` : ''}
                    {price.source && (
                      <>
                        {' · '}
                        <a href={price.source} target="_blank" rel="noreferrer">
                          source
                        </a>
                      </>
                    )}
                  </small>
                  {price.note && <small className="entry-sub">{price.note}</small>}
                </span>
              ),
            ],
          ]}
        />

        <Facts
          title="Agent"
          rows={[
            ['Harness', <HarnessCell s={s} />],
            ['NIKA agent', s.agent_type && <code>{s.agent_type}</code>],
            ['Adaptation', formatAdaptation(s)],
            ['Skills', list(scaffoldTags(s))],
            ['Tools', list(s.tools)],
            ['Tags', list(s.tags)],
            ...extraRows(s),
          ]}
        />

        <Facts
          title="Run"
          rows={[
            ['Benchmark', `NIKA ${s.benchmark_version}${s.split ? ` · ${s.split} split` : ''}`],
            [
              'Design',
              s.case_count != null &&
                `${formatInt(s.case_count)} cases × ${s.n_trials ?? '?'} trials`,
            ],
            [
              'Trials scored',
              s.n_trials_present != null &&
                `${formatInt(s.n_trials_present)} of ${formatInt(s.n_trials_expected)}`,
            ],
            [
              'Completed',
              s.n_success != null &&
                `${formatInt(s.n_success)} (${formatPct(s.success_rate)})`,
            ],
            ['Agent failures', s.n_agent_failed != null && formatInt(s.n_agent_failed)],
            ['Max steps', s.max_steps != null && formatInt(s.max_steps)],
            ['Case timeout', seconds(s.case_timeout_sec)],
            ['Run ID', s.run_id && <code>{s.run_id}</code>],
            [
              'NIKA commit',
              s.nika_git_commit && (
                <a
                  href={`${NIKA_REPO}/commit/${s.nika_git_commit}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <code>{s.nika_git_commit.slice(0, 10)}</code>
                </a>
              ),
            ],
            [
              'Official run',
              s.official == null ? null : s.official ? 'Yes' : 'No, self-reported',
            ],
            ['Submitted', s.created_at && formatDateUtc(s.created_at)],
          ]}
        />

        <Facts
          title="Usage and cost"
          rows={[
            ['Input tokens', hasTokens && formatInt(inTok)],
            ['Output tokens', hasTokens && formatInt(outTok)],
            ['Tokens / case', hasTokens && formatCount(s.mean_tokens)],
            ['Steps / case', formatCount(s.mean_steps) !== '—' && formatCount(s.mean_steps)],
            [
              'Tool calls',
              (s.steps_totals?.tool_calls ?? 0) > 0 && formatInt(s.steps_totals?.tool_calls),
            ],
            [
              'Tool errors',
              (s.steps_totals?.tool_calls ?? 0) > 0 && formatInt(s.steps_totals?.tool_errors),
            ],
            ['Cost / case', cost?.perCase != null && formatUsd(cost.perCase)],
            [
              'Cost / run',
              cost?.perRun != null &&
                `${formatUsd(cost.perRun)} (every case once)`,
            ],
            [
              'Total spent',
              cost && `${formatUsd(cost.total)} across ${s.n_trials ?? '?'} repeats`,
            ],
            [
              'Accounting',
              !hasTokens && 'This package reports no token counts, so no cost',
            ],
          ]}
        />

        <Facts
          title="Submission"
          rows={[
            ['Name', s.name],
            ['Authors', s.authors],
            ['Organization', s.org],
            ['Contact', s.email && <a href={`mailto:${s.email}`}>{s.email}</a>],
            [
              'Package',
              <a
                href={`${ARCHIVE_REPO}/tree/main/submissions/${s.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <code className="entry-wrap">{`submissions/${s.id}`}</code>
              </a>,
            ],
          ]}
        />

        {readme && <Readme text={readme} />}
      </div>
    </div>
  )
}
