# Agent Instructions

## Repository Purpose

- This repository is the official, append-only archive for NIKA leaderboard submissions and hosts the static leaderboard web UI. It stores compact, validated result packages; it does not contain the benchmark runner.
- `<NIKA_ROOT>` denotes the root of a local checkout of the NIKA source repository: `https://github.com/sands-lab/nika`.
- The NIKA source repository is the source of truth for the `nika leaderboard` CLI, schemas, packing, validation, release manifests, and tests.
- `<NIKA_LEADERBOARD_ROOT>` denotes the root of this repository.
- Read `<NIKA_ROOT>/docs/leaderboard-submission.md` before changing submission data. For implementation details, inspect `<NIKA_ROOT>/src/nika/workflows/leaderboard/` and `<NIKA_ROOT>/tests/leaderboard/`. If a local checkout is unavailable, consult the corresponding files at `https://github.com/sands-lab/nika`.

## Repository Layout

- `submissions/<release_version>/<YYYYMMDD>_<slug>/`: one immutable submission package per directory.
- `.github/workflows/validate-submission.yml`: discovers changed package roots and validates them with NIKA on pull requests.
- `.github/workflows/deploy-pages.yml`: builds aggregated JSON + the Vite UI and deploys GitHub Pages.
- `catalog/<release_version>/cases.json`: vendored release enrich (topo size, failure category) for the UI.
- `scripts/build_leaderboard_data.py` + root `pyproject.toml`: aggregate `submissions/` into `web/public/data/`.
- `web/`: Vite + React + TypeScript + ECharts leaderboard UI (npm).
- `README.md`: contributor entry point for submissions and local UI development.
- Submission packages remain the integrity-bound archive. The Python/`web` tooling is for the static leaderboard site only; do not treat this repo as the NIKA benchmark runner.

Each submission package must have exactly the generated shape:

```text
README.md
metadata.yaml
files.json
results/
  identity.yaml
  metrics.json
  trials/<trial_id>/result.json
```

Do not add raw traces, per-case session artifacts, credentials, caches, or source run directories to this repository.

## Normal Workflow

Create and validate packages from the NIKA repository, not by assembling them here by hand:

```shell
cd <NIKA_ROOT>
uv sync
uv run nika leaderboard template -o results/<run>/submission
# Edit only the template metadata.yaml and README.md.
uv run nika leaderboard pack \
  --result_dir results/<run> \
  --submission results/<run>/submission
uv run nika leaderboard validate results/<run>/<YYYYMMDD>_<slug> \
  --source-result-dir results/<run>
```

Then copy or submit the complete generated package at:

```text
submissions/<benchmark.version>/<package-directory-name>/
```

`nika leaderboard submit` normally performs that copy and opens the PR. Do not run it unless the user explicitly asks to push/open a PR, because it changes remote GitHub state.

## Editing Rules

- Treat `files.json`, `results/identity.yaml`, `results/metrics.json`, and every trial `result.json` as generated, integrity-bound data. Do not hand-edit them.
- `files.json` hashes `metadata.yaml`, the package `README.md`, identity, metrics, and all trial results. Editing any of those files after packing invalidates the package. Change the staging metadata/README and rerun `pack` instead.
- Do not fabricate scores, trial coverage, benchmark identities, release versions, or hashes. Packages must originate from a completed official release run (`run.official: true`).
- Submission paths must remain `submissions/<release_version>/<YYYYMMDD>_<slug>/`; the slug is derived from `metadata.info.name` as lowercase ASCII words joined with underscores.
- Add a new submission directory rather than overwriting or deleting an accepted historical entry unless the task explicitly calls for a correction and explains its provenance.
- Keep unrelated submissions byte-for-byte unchanged. Avoid repository-wide formatting or key reordering of YAML/JSON.
- Never commit secrets or local absolute filesystem paths. Validation scans package text for API keys, bearer tokens, private-key material, and machine-specific paths.

## Validation

From the NIKA checkout, validate every package touched by the change:

```shell
cd <NIKA_ROOT>
uv run nika leaderboard validate \
  <NIKA_LEADERBOARD_ROOT>/submissions/<release_version>/<package>
```

When the original run is available, also pass `--source-result-dir` so the source `run.json` hash is checked. Report clearly when the source run is unavailable; package-only validation is the same mode used by CI.

Validation checks schema version 1, the frozen release manifest, exact trial coverage, recomputed aggregate metrics, package hashes, official-run identity, secrets, and absolute paths. A visual review or JSON/YAML parse alone is not sufficient.

The PR workflow installs Python 3.12 and an editable checkout of `sands-lab/nika`, using repository variable `NIKA_REF` when set and otherwise `main`. If local validation and CI disagree, compare the local NIKA commit with that ref before changing submission data.

## Scope and Safety

- Changes to leaderboard behavior, schemas, scoring, packing, or validation belong under `<NIKA_ROOT>`, with its tests, not in this archive.
- The static leaderboard UI (`web/`, `scripts/`, `catalog/`) may be edited in this repository. Do not mutate integrity-bound submission files to make the UI look better; enrich via catalog/aggregation instead.
- Do not weaken or bypass `.github/workflows/validate-submission.yml` to make invalid data pass. Fix the producer or regenerate the package.
- Preserve `submissions/.gitkeep` while the archive is empty.
- Before handing off, run `git status --short` here and confirm that only the intended package, UI, catalog, or documentation files changed.
