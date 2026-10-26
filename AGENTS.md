# Agent Instructions

## Documentation

- Keep the README focused on readers and submitters: purpose, links, the shortest useful commands, and a brief catalog overview.
- Put site development, catalog maintenance, and deployment details in `docs/development.md`. Keep automation rules and archive-editing constraints in this file rather than repeating them in human-facing guides.
- Follow the [NIKA documentation guidelines](https://github.com/sands-lab/nika/blob/main/.agents/skills/nika-docs/SKILL.md): explain reader purpose first, use clear sentences and conventional terminology, avoid hype and repetition, and verify commands against current implementation.

## Terminology

- Before writing UI text or documentation, read the NIKA glossary at `<NIKA_ROOT>/GLOSSARY.md` (or `https://github.com/sands-lab/nika/blob/main/GLOSSARY.md` without a local checkout) and use its terms. Read the current version each time; do not rely on a remembered copy.
- On this site, that means: **task**, not "case"; **network environment** (or "environment"), not "scenario"; **failure** (fault), not "problem"; **trial** for one scored run of a task; **benchmark release** for a versioned task set; **model**, **harness**, and **provider** as the glossary defines them.
- In the glossary, **submission** is the run phase in which the agent turns its report into a structured answer. Call a leaderboard row an **entry**; keep "submit" and "submission package" only for handing results to the leaderboard. The share of trials that produced a scorable answer is **Diagnosis submitted (%)**.
- Code identifiers, data fields, file names, and CLI options keep their names (`case_key`, `scenario`, `problem`, `cases.json`); rename only the words readers see.

## Repository Purpose

- This repository is the official, append-only archive for NIKA leaderboard **scores** and hosts the static leaderboard web UI. It stores compact, validated result packages; it does not contain the benchmark runner.
- Raw agent trajectories (`messages.jsonl`, `nika.jsonl`, session logs, ground truth dumps) belong on Hugging Face: [`nika-bench/nika-trajectories`](https://huggingface.co/datasets/nika-bench/nika-trajectories). Do not add trajectory dumps to `submissions/`.
- `<NIKA_ROOT>` denotes the root of a local checkout of the NIKA source repository: `https://github.com/sands-lab/nika`.
- The NIKA source repository is the source of truth for the `nika leaderboard` CLI, schemas, packing, validation, release manifests, and tests.
- `<NIKA_LEADERBOARD_ROOT>` denotes the root of this repository.
- Read `<NIKA_ROOT>/docs/benchmarks/leaderboard-submission.md` before changing submission data. For implementation details, inspect `<NIKA_ROOT>/src/nika/workflows/leaderboard/` and `<NIKA_ROOT>/tests/leaderboard/`. If a local checkout is unavailable, consult the corresponding files at `https://github.com/sands-lab/nika`.

## Repository Layout

Submission packages remain the integrity-bound archive. The Python/`web` tooling is for the static leaderboard site only; do not treat this repo as the NIKA benchmark runner.

Each submission package must have exactly the generated shape:

```text
README.md
metadata.yaml
results/
  identity.yaml          # may include trajectories_relpath
  metrics.json
  rca_confusion.json
  trials/<trial_id>/result.json
```

Do not add raw traces, per-trial session artifacts, credentials, caches, or source run directories to this repository.

## Normal Workflow

`nika leaderboard submit` normally copies the scores package here and opens the GitHub PR (and a paired HF trajectories PR). Do not run it unless the user explicitly asks to push/open a PR, because it changes remote GitHub/HF state.

## Editing Rules

- Use readable metadata labels and entry-specific links in the UI. Keep shared NIKA code, website, and paper links in site navigation instead of repeating them on each entry.
- Treat `results/identity.yaml`, `results/metrics.json`, `results/rca_confusion.json`, and every trial `result.json` as generated, integrity-bound data. Do not hand-edit them.
- Do not fabricate scores, trial coverage, benchmark identities, release versions, or hashes. Packages must originate from a completed official release run (`run.official: true`).
- Submission paths must remain `submissions/<release_version>/<YYYYMMDD>_<slug>/`; the slug is derived from `metadata.info.name` as lowercase ASCII words joined with underscores.
- Add a new submission directory rather than overwriting or deleting an accepted historical entry unless the task explicitly calls for a correction and explains its provenance.
- `catalog/lobehub.json`, `catalog/hf_orgs.json`, `web/public/providers/lobehub/`, and `web/public/providers/hf/` are written by the resolver workflow. Do not hand-edit them; put icon and vendor overrides in `catalog/vendors.json`, with hand-made images directly under `web/public/providers/`.
- Keep unrelated submissions byte-for-byte unchanged. Avoid repository-wide formatting or key reordering of YAML/JSON.
- Never commit secrets or local absolute filesystem paths. Validation scans package text for API keys, bearer tokens, private-key material, and machine-specific paths.

## Visual Style

Every figure should state its result plainly and read at a glance; do not make results small or faint.

- **One place for chart style.** Type sizes, stroke widths, colours, and the chart typeface live in `web/src/lib/chartTheme.ts` (`CHART_FONT`, `CHART_STROKE`, `CHART_FONT_FAMILY`). `ChartPanel` applies them to every chart, its enlarged view, and its PNG/PDF export, and enforces the minimums. Change the theme there instead of setting smaller sizes in a page.
- **Transparent exports.** PNG and PDF downloads have no background and are made for a light or dark page, as the reader chooses. A light export swaps the theme's ink for `LIGHT_EXPORT_INK` by exact colour string, so pages take text, line, and surface colours from the theme constants rather than writing literal colours.
- **Type scale.** Axis ticks 14px (12px on category axes with more than 24 entries), axis names 15px bold, legends 14px, bar value labels at least 12px, Sankey and graph node names at least 13px. Labels drawn inside the plot may stay around 11px so they do not crowd the marks. Chart titles are 1.1rem.
- **Strokes.** Series lines and radar outlines 3px; axis lines and ticks 1.5px and clearly visible; grid lines recessive.
- **No collisions.** Larger text must not overlap marks, the zoom toolbox, sliders, or other labels. ECharts' `containLabel` undersizes long category axes; compute the margins with `measureText` instead, as the Task Matrix does. Put dense column labels on one line at 45°. Give polar tick labels a halo in the panel colour.
- **Summaries stand apart.** An average or total row or column sits after an empty spacer, uses the same colour scale, and has a white outline and heavier type, so it never reads as one more entry. Where a summary sorts the view, sort by clicking its label and show the direction with ▲ / ▼ / ⇅, as on the leaderboard's sortable headers.
- **One view per result.** Do not show the same numbers as both a chart and a table. Put controls that change a chart in its header through `ChartPanel`'s `controls` prop. Explain metrics and controls with a plain `title` attribute, which `FastTooltip` renders, and with the chart's `description`.
- **Comparable units.** Report cost and tokens per task: the median by default, with a Median / p95 choice on analytics charts. Never compare entries on a full benchmark run or a submission total, since those scale with the release's task count. Run totals belong on the entry page only.
- **Readable categories.** Show labels, not keys: failure domains through `categoryLabel` ("Routing", not `routing_control_plane`), topology sizes as Small (S), Medium (M), Large (L), listed in that order. Leave out tasks that lack the grouping value rather than showing a `null` or "unknown" row.
- **Layout.** On wide screens the leaderboard sits in a centred, capped column that widens for each optional column, instead of spreading columns apart. The root font steps up to 17, 18, and 19px at 1024, 1600, and 2200px. Chart headers wrap their controls below the title on narrow screens.
- **Check visually.** After a visual change, screenshot the affected pages at phone (390px), laptop (1280–1440px), and wide (1920px or more) widths, and run `npm run test:e2e` from `web/`.

## Scope and Safety

- Changes to leaderboard behavior, schemas, scoring, packing, or validation belong under `<NIKA_ROOT>`, with its tests, not in this archive.
- The static leaderboard UI (`web/`, `scripts/`, `catalog/`) may be edited in this repository. Do not mutate integrity-bound submission files to make the UI look better; enrich via catalog/aggregation instead.
- Do not weaken or bypass `.github/workflows/validate-submission.yml` to make invalid data pass. Fix the producer or regenerate the package.
- Preserve `submissions/.gitkeep` while the archive is empty.
- Before handing off, run `git status --short` here and confirm that only the intended package, UI, catalog, or documentation files changed.
