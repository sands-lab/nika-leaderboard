# NIKA Leaderboard

Official submission archive and static leaderboard UI for [NIKA](https://github.com/sands-lab/nika).

Pack, validate, and open PRs with the NIKA CLI:

- **Scores** land here under `submissions/<release_version>/{YYYYMMDD}_{slug}/` (GitHub PR)
- **Trajectories** go to the Hugging Face dataset [`Zhihao98/nika-trajectories`](https://huggingface.co/datasets/Zhihao98/nika-trajectories) (Hub PR)

Full instructions, package layout, metadata schema, and PR checklist:

**[docs/leaderboard-submission.md](https://github.com/sands-lab/nika/blob/main/docs/benchmarks/leaderboard-submission.md)**

```shell
nika leaderboard submit path/to/YYYYMMDD_slug
```

Do **not** commit raw traces, `messages.jsonl`, pcaps, or full session trees into this repository. CI re-runs `nika leaderboard validate` on PRs that touch `submissions/`.

## Leaderboard web UI

The `web/` app is a Vite + React + TypeScript + ECharts static site. It ranks validated packages, filters by scaffold/provider/model/tags, compares selected entries (pairwise + charts), and shows scenario / failure / size matrices. When a package identity includes `trajectories_relpath`, the UI links to the paired HF trajectories folder.

### Prerequisites

- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- Node.js 20+ (CI uses 22) and npm

### Generate data

From the repository root:

```shell
uv sync
uv run python scripts/build_leaderboard_data.py
```

This writes compact JSON under `web/public/data/` from `submissions/` plus vendored `catalog/<version>/cases.json` (topo size and failure category). When a local NIKA checkout is available (default sibling `../nika`, override with `--nika-root`), the script refreshes the catalog from release YAML.

CI builds with `--skip-catalog-refresh` so it only needs the committed catalog + submissions.

### Run locally

```shell
cd web
npm install
npm run data   # optional if data already generated
npm run dev
```

Open the printed local URL (base path `/`). Requires **Node.js 20+** (CI uses 22).

### Viewport / UI checks (Playwright)

Smoke-tests every page on mobile, tablet, and desktop viewports and writes full-page PNGs under `web/e2e/screenshots/` (gitignored):

```shell
cd web
npx playwright install chromium   # first time only
npm run test:e2e
```

Optional: `npm run test:e2e:ui` for the Playwright UI runner. Install the Cursor/VS Code extension **Playwright Test for VSCode** (`ms-playwright.playwright`) for one-click runs from the Testing sidebar.

### Production build

```shell
cd web
VITE_BASE_PATH=/nika-leaderboard/ npm run build
```

Artifacts land in `web/dist/`. The `deploy-pages.yml` workflow publishes that folder to GitHub Pages on pushes to `main`/`master`. Enable **Settings → Pages → Source: GitHub Actions** on the repository.

### Layout

```text
catalog/<version>/cases.json   # release enrich (size, failure category)
scripts/build_leaderboard_data.py
pyproject.toml                 # Python build deps (PyYAML via uv)
submissions/                   # immutable validated packages
web/                           # Vite React UI
  e2e/                         # Playwright viewport smoke tests
  playwright.config.ts
  public/data/                 # generated leaderboard JSON (from scripts/)
  src/
.vscode/extensions.json        # recommended Cursor/VS Code extensions
```

Do not hand-edit integrity-bound files inside submission packages (`files.json`, metrics, trials). Change staging metadata in NIKA and re-`pack` instead.
