# NIKA Leaderboard

Official submission archive and static leaderboard UI for [NIKA](https://github.com/sands-lab/nika).

Pack, validate, and open a PR with the NIKA CLI. Full instructions, package layout, metadata schema, and PR checklist:

**[docs/leaderboard-submission.md](https://github.com/sands-lab/nika/blob/main/docs/leaderboard-submission.md)**

```shell
nika leaderboard submit path/to/YYYYMMDD_slug
```

Submissions land under `submissions/<release_version>/{YYYYMMDD}_{slug}/`. CI re-runs `nika leaderboard validate` on PRs that touch `submissions/`.

## Leaderboard web UI

The `web/` app is a Vite + React + TypeScript + ECharts static site. It ranks validated packages, filters by scaffold/provider/model/tags, compares selected entries (pairwise + charts), and shows scenario / failure / size matrices.

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

Open the printed local URL (base path `/`).

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
web/                           # Vite React UI
submissions/                   # immutable validated packages
```

Do not hand-edit integrity-bound files inside submission packages (`files.json`, metrics, trials). Change staging metadata in NIKA and re-`pack` instead.
