import { useLeaderboardData } from '../lib/LeaderboardDataContext'

const SUBMISSION_DOC =
  'https://github.com/sands-lab/nika/blob/main/docs/benchmarks/leaderboard-submission.md'
const TRAJECTORIES =
  'https://huggingface.co/datasets/Zhihao98/nika-trajectories'

function formatBuilt(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

export function SiteFooter() {
  const { meta } = useLeaderboardData()
  const built = formatBuilt(meta?.generated_at)

  return (
    <footer className="site-footer">
      <span>{built ? `Data built ${built}` : 'NIKA leaderboard'}</span>

      {meta?.citation && (
        <details className="site-footer__cite">
          <summary>Cite this benchmark</summary>
          <pre>{meta.citation}</pre>
        </details>
      )}

      <nav className="site-footer__links" aria-label="Resources">
        <a href={SUBMISSION_DOC} target="_blank" rel="noreferrer">
          How to submit
        </a>
        <a href={TRAJECTORIES} target="_blank" rel="noreferrer">
          Trajectories
        </a>
        <a
          href="https://github.com/sands-lab/nika-leaderboard"
          target="_blank"
          rel="noreferrer"
        >
          Archive
        </a>
      </nav>
    </footer>
  )
}
