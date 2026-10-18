# NIKA Leaderboard

Official submission archive and static leaderboard UI for [NIKA](https://github.com/sands-lab/nika).

Pack, validate, and open PRs with the NIKA CLI:

- **Scores** land here under `submissions/<release_version>/{YYYYMMDD}_{slug}/` (GitHub PR)
- **Trajectories** go to the Hugging Face dataset [`nika-bench/nika-trajectories`](https://huggingface.co/datasets/nika-bench/nika-trajectories) (Hub PR)

Full instructions, package layout, metadata schema, and PR checklist:

**[docs/leaderboard-submission.md](https://github.com/sands-lab/nika/blob/dev/docs/benchmarks/leaderboard-submission.md)**

```shell
# after an official run: uv run nika benchmark run --release 0.2.0 --split test --result_dir results/my-run ...
uv run nika leaderboard submit --result_dir results/my-run \
  --name "My Agent" --authors "Your Name"
```

Use a NIKA `dev` checkout for this command until `main` supports the
`--name` / `--authors` options. Run it from your NIKA checkout after completing
an official release run. Authenticate with `gh auth login` and
`uv run hf auth login` (or set `GH_TOKEN` and `HF_TOKEN`).

The command generates metadata and a short README, validates both packages,
and opens the paired GitHub and Hugging Face PRs. Add `--dry-run` for local
validation before uploading. For custom metadata and documentation, use
`--submission DIR` instead of `--name` / `--authors`.

Maintainers review and merge both PRs. A successful submit prints their URLs; it does not publish or merge the entry itself.

Do **not** commit raw traces, `messages.jsonl`, pcaps, or full session trees into this repository. CI re-runs `nika leaderboard validate` on PRs that touch `submissions/`.

## Leaderboard web UI

The `web/` app is a Vite + React + TypeScript + ECharts static site. It ranks validated packages, filters by harness/provider/model/tags, compares selected entries (pairwise + charts), and shows scenario / failure / size matrices. The table keeps to the headline columns; clicking a row opens the entry's page (`#/entry/<release>/<package>`) with its full metadata, run settings, token usage, and cost breakdown. When a package identity includes `trajectories_relpath`, the UI links to the paired HF trajectories folder.

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

### Submission display metadata

Before accepting a submission, review its public harness name, code and project
links, and model identity. Submitters provide runs only: they do not supply
model release dates or prices. Those describe the model, not the run, and this
repository resolves and maintains them in `catalog/models.json` and
`catalog/pricing.json`. The [submission guide](https://github.com/sands-lab/nika/blob/dev/docs/benchmarks/leaderboard-submission.md#model-release-dates-prices-and-display-names)
describes the cost calculation.

#### Model catalog

Catalog keys are lowercase runtime model IDs (`claude-haiku-5-5`,
`qwen3.6-35b-a3b-fp8`). A submitted `agent.model` matches the key that is equal
to it after lowercasing and replacing punctuation with `-`, so `Claude Haiku 5.5`
and `claude-haiku-5-5` are the same model. Each `models.json` entry has a display
`name`, `released` (YYYY-MM-DD), HTTPS `release_source` and `model_page`, and
optionally `hf_repo` (`owner/name`, used to price open weights) and
`retrieved_via` (the aggregator the date was read from).

`name` is the model's models.dev display name: the vendor's own listing, else
the name most providers on models.dev use for that ID, else the Hugging Face
repo name. The data build shows it everywhere a model is named (tables, charts,
filters, generated entry labels) in place of the submitted string, so
`claude-sonnet-5-5` and `Claude Opus 5.5` read alike. This applies to every
entry on each build; a model not yet catalogued shows its submitted string
until its catalog entry merges. The entry page still shows the original
spelling, and summaries keep it as `submitted_model` next to the catalog key
`model_id`.

Each `pricing.json` entry has `basis` (`api` or `hosted_open_weight`),
`provider`, an optional `note`, and a dated `quotes` list. A quote has positive
`input` and `output` USD per million tokens, an HTTPS `source` (vendor or
provider page), a `retrieved` date, and optionally `retrieved_via`, `cache_read`
and prompt-length `tiers` (`[{min_prompt_tokens, input, output}]`). A submission
is priced with the latest quote retrieved on or before its package date
(`YYYYMMDD` prefix), or the earliest quote if the model was priced after it
merged, so a published cost never changes. Quotes are appended only when a rate
changes. Cost stays a flat `(in × input + out × output) / 1e6`: packages record
token totals per trial, not per-request prompt lengths, so tiers and cache rates
are documentation only.

A model has two "no price" states. *Pending*: no entry yet; the resolver keeps
trying. *N/A*: a curator confirmed no public quote exists and recorded
`"status": "unavailable"` with a `note` and no quotes; the resolver skips it.
The website marks both distinctly and leaves cost blank.

#### Checks and the resolver

The `model-metadata` PR check runs the tests and validates the catalog files'
format (HTTPS sources, valid past dates, positive finite rates, `basis`,
`provider`, date-ordered quotes). A submitted model missing from the catalog is
listed as pending and does not block the merge. Run it locally:

```shell
uv run python scripts/validate_model_metadata.py
```

`scripts/resolve_model_metadata.py` fills the catalog from public sources:

| Models | Rates | Release date |
|---|---|---|
| Proprietary | models.dev, cross-checked against OpenRouter and LiteLLM (models.dev wins) | models.dev |
| Open weights | OpenRouter, joined on `hugging_face_id` (base weights for FP8 and other quantized checkpoints, with a note) | first Hugging Face commit that adds weights |

Citations point at the vendor or provider page from a small provider table in
the script; the aggregator goes in `retrieved_via`. The
`resolve-model-metadata.yml` workflow runs it on every push to `main` that
touches `submissions/**` (new models only) and weekly (also appends changed
prices), and opens or updates a `bot/model-metadata` pull request with a report
of every change and what to check. A curator reviews and merges it. Pull
requests opened with the workflow token do not trigger other workflows, so close
and reopen the bot PR to run the checks. Try it locally without editing files:

```shell
uv run python scripts/resolve_model_metadata.py --dry-run
```

Hugging Face repos can be populated before a model's announcement, so confirm
open-weight release dates. Models the resolver cannot price (for example quotes
only on Featherless AI) stay pending until a curator adds a quote by hand or
marks them unavailable. Open-weight prices estimate hosted inference, including
any documented precision differences; they do not measure the submitter's GPU
bill. Prices are editable per model in the UI, and a "current prices" toggle
re-prices every entry at its model's latest quote for strict cross-model
comparison.

Trajectory package directories use `YYYYMMDD_<framework>_<model>` with lowercase
ASCII words separated by underscores, such as
`20261012_claude_code_gemma_4_31b_it`. The public trajectory link uses this
canonical directory. Accepted scores package IDs remain fixed.

The data builder derives `name` from model, normalized harness, optimization
methods, and skills. Repeated configurations add split and run identity. It
preserves the submitter's title in `submission_name` for the detail page. Charts
and comparisons use the generated label, while accepted package names stay fixed.

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
VITE_BASE_PATH=/nika/leaderboard/ npm run build
```

Artifacts land in `web/dist/`. The live site is **`https://sands-lab.github.io/nika/leaderboard/`**, published under the [`sands-lab/nika`](https://github.com/sands-lab/nika) `gh-pages` branch (`leaderboard/`). On pushes to `main`/`master`, `deploy-pages.yml` builds with that base path, copies `index.html` to `404.html` for SPA deep links, syncs `web/dist` into `nika` `gh-pages/leaderboard/`, and deploys a redirect from the legacy `…/nika-leaderboard/` URL.

Cross-repo publish needs a repo secret **`NIKA_PAGES_TOKEN`**: a fine-grained or classic PAT with `contents: write` on `sands-lab/nika`.

The marketing site deploy (`nika-website` → `nika` `gh-pages`) must use `keep_files: true` so it does not wipe `leaderboard/` on each website publish.

### Layout

```text
catalog/<version>/cases.json   # release enrich (size, failure category)
catalog/models.json            # model display names, release dates, model pages
catalog/pricing.json           # dated reference price quotes
scripts/build_leaderboard_data.py
scripts/model_catalog.py       # catalog key matching, quote selection, format rules
scripts/resolve_model_metadata.py
scripts/validate_model_metadata.py
pyproject.toml                 # Python build deps (PyYAML via uv)
submissions/                   # immutable validated packages
web/                           # Vite React UI
  e2e/                         # Playwright viewport smoke tests
  playwright.config.ts
  public/data/                 # generated leaderboard JSON (from scripts/)
  src/
.vscode/extensions.json        # recommended Cursor/VS Code extensions
```

Do not hand-edit integrity-bound files inside submission packages (`identity.yaml`, `metrics.json`, `rca_confusion.json`, trial `result.json`). Fix the run or metadata in NIKA and rerun `nika leaderboard submit` instead.

### Ranking

The table ranks entries of the same release by mean RCA F1 with ex-aequo ties. An entry's rank is 1 + the number of entries whose RCA F1 is significantly higher, so statistically indistinguishable neighbours share a rank (the same rule as LMArena's upper-bound rank). `scripts/build_leaderboard_data.py` decides significance with a paired cluster bootstrap over cases (10,000 resamples, seed 0, 95%). Every entry is rescored on the same resampled case set and all trials of a case are drawn together, so trial-to-trial noise stays inside its case. Each RCA F1 is shown as `score ± margin`, where the margin is half the width of its 95% percentile interval (the convention of Terminal-Bench and similar leaderboards); the tooltip gives the full range. Entries without per-trial results fall back to point-estimate ranking. The UI recomputes ranks over the visible rows when filters hide entries.
