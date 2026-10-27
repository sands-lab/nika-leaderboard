# Developing the leaderboard

Use this guide to maintain the static site and its catalogs. For submitting a benchmark run or starting a local preview, begin with the [README](../README.md).

## Project layout

The site combines reviewed score packages with shared model and benchmark information. Python generates the JSON data; the Vite, React, TypeScript, and ECharts app displays it.

| Location | Purpose |
| --- | --- |
| `submissions/<release>/<package>/` | Validated score packages |
| `catalog/models.json` | Model display names, release dates, and source links |
| `catalog/pricing.json` | Dated reference price quotes |
| `catalog/vendors.json` | Hand-maintained vendor overrides: labels, model and vendor icons, and attributions |
| `catalog/lobehub.json`, `web/public/providers/lobehub/` | Model and vendor icons matched on LobeHub by the resolver |
| `catalog/hf_orgs.json`, `web/public/providers/hf/` | Vendor names, and avatars where LobeHub has no icon, from Hugging Face |
| `web/public/providers/` | Icons; hand-made ones sit beside the resolver's `lobehub/` and `hf/` folders |
| `catalog/<release>/cases.json` | Benchmark task metadata: topology size and failure domain |
| `scripts/build_leaderboard_data.py` | Generate site data from packages and catalogs |
| `scripts/model_catalog.py` | Match model identities, select quotes, and validate catalog format |
| `scripts/vendors.py` | Decide each entry's vendor, its labels and icons, and validate the icon files |
| `scripts/resolve_model_metadata.py` | Propose missing model metadata, changed prices, and model and vendor icons |
| `scripts/validate_model_metadata.py` | Check catalog format and report pending models |
| `scripts/check_vendor_icons.py` | Report packages that would show without a model or vendor icon |
| `web/src/` | Site components, pages, and browser-side calculations |
| `web/public/data/` | Generated site data |
| `tests/`, `web/e2e/` | Python tests and Playwright viewport checks |

Submission packing, score validation, and benchmark execution belong to the [NIKA repository](https://github.com/sands-lab/nika), not this site. See [AGENTS.md](../AGENTS.md) for archive integrity and automation constraints.

## Development checks

After the [local preview setup](../README.md#preview-the-leaderboard-locally), run Python checks from this repository's root:

```shell
uv run python -m unittest discover -s tests
uv run python scripts/validate_model_metadata.py
uv run python scripts/build_leaderboard_data.py --skip-catalog-refresh
```

The validator checks catalog format, including source URLs, dates, rates, quote ordering, and that every icon file exists. Models missing from the catalogs are reported as pending, not validation failures. The `model-metadata` job runs these tests and the validator on every pull request. A separate `validate` job uses the NIKA CLI to validate submission packages that the pull request adds or changes. It runs only when a `changes` job finds such a package; on other pull requests it is skipped, and GitHub counts the skipped job as passing.

The `vendor-icons` job reports packages that the site would show without a model or vendor icon, with the `catalog/vendors.json` entry that would fix each one. A package passes when it has a saved icon, or when LobeHub or the vendor's Hugging Face organization has one that the resolver will download after merge. The job runs only on pull requests that add or change a submission package, checking those packages, and on the resolver bot's catalog proposals, checking every package. Other maintenance pull requests skip it. It is deliberately not a required check: a failure marks a display gap, and the maintainer decides whether to merge anyway. To run it locally:

```shell
uv run python scripts/check_vendor_icons.py --all
```

For web changes, run these commands from `web/`:

```shell
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright starts a local Vite server and checks mobile, tablet, and desktop layouts. Full-page screenshots go to `web/e2e/screenshots/`; the HTML report goes to `web/playwright-report/`. Both are ignored by Git. Use `npm run test:e2e:ui` for the interactive runner.

## Catalog maintenance

There are two independent refresh paths. Model metadata comes from public services and is proposed through a pull request. Benchmark task metadata comes from NIKA release files and is refreshed locally when a release needs updating.

### Model names, dates, and prices

The [resolver workflow](../.github/workflows/resolve-model-metadata.yml) runs:

- After a push to `main` touching `submissions/**`, to fill missing model records without refreshing existing prices.
- Every Monday at 06:00 UTC, to fill missing records and check existing prices.
- On manual dispatch from GitHub Actions, with the same scope as the weekly run.

The resolver reads submitted `agent.model` values and queries public sources:

| Model type | Release date | Reference price |
| --- | --- | --- |
| Proprietary | Vendor listing on models.dev | models.dev, cross-checked against OpenRouter and LiteLLM; models.dev takes precedence |
| Open weights | First Hugging Face commit containing weights | OpenRouter, matched by `hugging_face_id`; a base-weight quote may stand in for a quantized checkpoint, with a note |

Display names use models.dev: the vendor's listing first, otherwise the most common provider name for those weights, then the Hugging Face repository name as a fallback. Source links point to vendor or provider pages; `retrieved_via` identifies the service used for the lookup.

New records and changed price quotes go into `catalog/models.json` and `catalog/pricing.json`, and model and vendor icons into `catalog/lobehub.json`, `catalog/hf_orgs.json`, and `web/public/providers/` (see [Model and vendor icons](#model-and-vendor-icons)). The workflow opens or updates `bot/model-metadata` with a report of changes, review notes, unresolved models, and source failures. If there are no catalog changes to propose, it creates no new proposal. It never edits score packages.

Proposals carry the `catalog` label. The auto-merge workflow (`.github/workflows/auto-merge-catalog-bot.yml`) runs every six hours and merges a labelled proposal after two days without activity, bringing it up to date with `main` first if needed. Any comment, review, commit, or label change restarts the two days, so commenting is enough to hold a proposal for review. To stop a merge, request changes or convert the PR to a draft.

If an idle proposal has merge conflicts or failing required checks, the workflow comments on the PR and starts the **Catalog proposal needs attention** workflow, which does nothing else. The GitHub Slack app posts a message for every run of a subscribed workflow, so subscribing to that workflow alone reports only blocked proposals:

```text
/github subscribe sands-lab/nika-leaderboard workflows:{name:"Catalog proposal needs attention" event:"repository_dispatch"}
```

The comment restarts the two days, so a proposal that stays blocked is reported again every two days until a curator fixes or closes it.

The bot uses a GitHub App installation token, so its PRs trigger validation workflows automatically. There is no need to close and reopen them to start checks. Repository configuration requires the `CATALOG_BOT_APP_ID` Actions variable and `CATALOG_BOT_PRIVATE_KEY` secret.

To preview a refresh without editing the catalogs, run from this repository's root:

```shell
uv run python scripts/resolve_model_metadata.py --dry-run
```

This command makes network requests. Add `--no-refresh` to limit it to missing records. To write proposed catalog changes locally and save a review report:

```shell
uv run python scripts/resolve_model_metadata.py --report /tmp/nika-catalog-report.md
uv run python scripts/validate_model_metadata.py
```

### Review a catalog proposal

Use [PR #58](https://github.com/sands-lab/nika-leaderboard/pull/58) as an example of a price refresh: it appends changed OpenRouter quotes and identifies Featherless AI quotes that need manual maintenance.

Before merging a proposal:

1. Check that the model identity and source links refer to the evaluated model. Review any difference between a quantized checkpoint and the quoted weights.
2. Confirm release evidence. A Hugging Face weight upload can precede the public announcement.
3. Check input/output rates, units, provider, and any tier or cache information against the cited pages. Review disagreements reported by the resolver.
4. Read the pending, skipped, and source-failure sections. Resolve what you can; a successful workflow does not mean every model was resolved.
5. Confirm the PR checks pass. Merge only the reviewed catalog changes; the push to `main` then rebuilds the site.

Prices from providers outside the automated refresh path, such as Featherless AI, need manual updates. Append a sourced, dated quote when rates change. If a curator confirms that no public quote is available, record `status: "unavailable"` with an explanatory `note` and no quotes. The resolver skips these price entries; unresolved prices without that status remain pending. Both states leave cost blank, with different labels in the UI.

### Catalog record format

Keys are lowercase runtime model IDs, such as `claude-haiku-5-5`. Matching lowercases the submitted model name and replaces punctuation with `-`, so `Claude Haiku 5.5` matches `claude-haiku-5-5`.

| Record | Required fields | Optional fields |
| --- | --- | --- |
| `models.json` entry | `name`, `released`, `release_source`, `model_page` | `hf_repo`, `retrieved_via` |
| `pricing.json` model entry | `basis` (`api` or `hosted_open_weight`), `provider`, `quotes` | `note`; `status` for an unavailable price instead of quotes |
| Price quote | `input`, `output`, `source`, `retrieved` | `retrieved_via`, `cache_read`, `tiers`, `note` |

Prices are positive finite USD rates per million tokens. Dates use `YYYY-MM-DD` and cannot be in the future. Source URLs use HTTPS. The pricing file also declares `currency: "USD"`, `unit: "per_million_tokens"`, and an `as_of` date. Quotes are ordered by strictly increasing retrieval date. Prompt-length tiers record `min_prompt_tokens`, `input`, and `output`, with an optional `cache_read` rate.

### Model and vendor icons

The model column shows the model's own logo where one exists (Claude, Gemma, Qwen) and otherwise the logo of the vendor that made it, never that of the service that ran it. The Provider filter and the entry page's Vendor row use the vendor.

[`scripts/vendors.py`](../scripts/vendors.py) identifies a vendor by its Hugging Face organization, lowercased, and resolves each entry in this order:

1. A `catalog/vendors.json` entry that lists the model under `models`.
2. The owner of the model's Hugging Face repository, from `catalog/models.json` (`hf_repo`), then the package's `agent.extra.hf_repo`, then a self-hosted run's model ID when it has the form `org/name`. A vendor that lists the owner under `hf_accounts` claims the repository instead.
3. The run's hosted `llm_provider`, such as `anthropic`, or the vendor that lists it under `llm_providers`. NIKA's `custom` provider describes a self-hosted endpoint, so it never names a vendor.

An icon set by hand always wins over a downloaded one. The model column shows the first available of:

1. The model's icon in `catalog/vendors.json` (`model_icons`).
2. The vendor's icon in `catalog/vendors.json` (`icon`).
3. The model's [LobeHub](https://lobehub.com/icons) icon.
4. The vendor's LobeHub icon, then the avatar of its Hugging Face organization.

The resolver matches each submitted model against LobeHub's model icons by name prefix (`qwen3-6-27b` matches Qwen; a match must end at a non-letter), and each vendor against all LobeHub icons by its ID or display name, ignoring punctuation (`zai-org`, named "Z.ai", matches Z.ai). Matches are recorded in `catalog/lobehub.json` and the SVGs saved under `web/public/providers/lobehub/`. Because the site is dark, the resolver uses LobeHub's colour variant only when one of its colours reaches 3:1 contrast against the icon's backing; otherwise it saves the single-colour variant drawn in the site's light ink.

For every vendor, the resolver records the Hugging Face organization's display name in `catalog/hf_orgs.json`. It downloads the organization's avatar to `web/public/providers/hf/` only when the vendor has no hand-made or LobeHub icon. Avatars are stored as served, in PNG, JPEG, GIF, or WEBP format, and shown with a light backing because some are dark logos on transparency.

New models and vendors are matched after each submission merge. The weekly run re-matches everything, downloads icons from new LobeHub releases, re-reads every organization, and proposes any changed icon, avatar, or name. Personal accounts, and vendors with no icon from either source, are listed as pending in the proposal.

Edit `catalog/vendors.json` by hand when the automatic result is wrong or missing. Its fields override anything downloaded, and the resolver does not look up what they already provide:

| Field | Purpose |
| --- | --- |
| `label` | Display name, replacing the organization's name |
| `icon` | Vendor icon, as a path relative to `web/public/providers/`; it also replaces downloaded model icons for this vendor's models |
| `model_icons` | Model name to icon path for this vendor's models; `null` shows the vendor icon instead |
| `models` | Model names credited to this vendor, for runs that record no repository or provider |
| `hf_accounts` | Repository owners credited to this vendor, such as a personal account that published the model |
| `llm_providers` | NIKA provider names that mean this vendor, such as `deepseek` for `deepseek-ai` |
| `note` | Why the entry exists |

Put hand-made images directly under `web/public/providers/`, outside the `hf/` and `lobehub/` folders the resolver manages. SVG logos are shown on a dark disc, so draw them in light or brand colours; raster images are cropped to a circle on a light backing, so use a square image. Each model, account, and provider name may be claimed by only one vendor.

### Benchmark task metadata

`catalog/<release>/cases.json` supplies topology sizes and failure domains for the result breakdowns. It is not updated by the model resolver.

To regenerate it from a local checkout of public NIKA `main`, run from this repository's root:

```shell
uv run python scripts/build_leaderboard_data.py --nika-root /path/to/nika
```

The builder reads `benchmark/releases/<release>/{dev,test}.yaml` and incident definitions from that checkout. It refreshes known release catalogs and discovers the newest release. Without `--nika-root`, it looks for a sibling `../nika` checkout. If the checkout or release is absent, it uses the committed catalog where available and warns when task metadata is missing.

For an ordinary site build, use `--skip-catalog-refresh` instead. This uses committed catalogs without reading a NIKA checkout or fetching model data. CI uses this mode so publishing does not depend on live catalog services.

## How results are presented

### Names and links

The builder derives entry labels from the catalog model name, reasoning effort, normalized harness name, optimization methods, and skills. Reasoning effort comes from `run.reasoning_effort` in `results/identity.yaml`, falling back to `agent.extra.reasoning_effort` for older packages; when neither records it, the site shows none rather than assuming a default. Repeated configurations include split and run identity. The detail page retains the submitted title as `submission_name` and original model spelling as `submitted_model`, alongside the resolved `model_id`.

Entry links use hash routes such as `#/entry/<release>/<package>`. When an identity includes `trajectories_relpath`, the site links to the corresponding Hugging Face folder. Public trajectory directories use `YYYYMMDD_<framework>_<model>` with lowercase ASCII words separated by underscores; accepted scores package IDs stay fixed.

### Ranking and uncertainty

Entries are compared within a benchmark release and split. Rank is one plus the number of entries with a significantly higher mean RCA F1, allowing ties when differences are not statistically distinguishable. Filtering recomputes ranks over the visible entries.

The builder uses a paired cluster bootstrap over benchmark tasks (`case_key`): 10,000 resamples, seed 0, and 95% confidence intervals. All trials of a task stay together, and compared entries use the same resampled tasks. The displayed margin is half the width of the percentile interval; the tooltip shows the full interval. Entries without usable per-trial results fall back to point-estimate comparison. See `rank_statistics` in [the data builder](../scripts/build_leaderboard_data.py) and [statistics tests](../tests/test_statistics.py).

### Reference costs

By default, each submission uses the latest quote retrieved on or before its package date (`YYYYMMDD` prefix). If all quotes are newer, it uses the earliest quote. The resolver appends a quote only when recorded rates change and leaves older quotes intact, so later price refreshes preserve historical estimates.

The calculation is `(input_tokens × input_rate + output_tokens × output_rate) / 1,000,000`. Tiers and cache rates are retained as reference information but are not applied: packages contain per-trial token totals, not per-request prompt lengths. Open-weight quotes estimate hosted inference, not the submitter's GPU bill.

The leaderboard's cost column shows the cost of one task: the median over the release's tasks, where each task is the mean of its trials. The builder writes those per-task token means as `task_tokens` (see `task_tokens` in [the data builder](../scripts/build_leaderboard_data.py)), and the browser prices them. Packages without per-trial token counts fall back to the mean cost per trial. The cell's tooltip also gives the 95th percentile and the mean. The optional input and output token columns use the same per-task median. Comparisons never use a full run, because that figure scales with the number of tasks in a release. Each entry page lists the run's totals (tokens, cost, and trial count) alongside its per-task figures. The leaderboard's CSV export has the table's columns, optional ones included, with the same per-task figures.

The analytics cost and token charts on the Compare and Score Trends pages offer a Median or p95 per-task choice, shared across pages and saved in the browser. Under p95, packages without per-trial token counts are left out.

The UI's current-prices toggle uses each model's latest quote for comparison. Readers can also override prices in the UI; those changes do not edit the repository catalog. See [quote selection](../scripts/model_catalog.py) and [browser-side pricing](../web/src/lib/pricing.ts).

## Build and publish

From the repository root, generate data using the committed catalogs, then build the production site:

```shell
uv run python scripts/build_leaderboard_data.py --skip-catalog-refresh
cd web
VITE_BASE_PATH=/nika/leaderboard/ npm run build
```

The build writes `web/dist/`. [Deploy leaderboard site](../.github/workflows/deploy-pages.yml) runs on pushes to `main` or `master` and on manual dispatch. It publishes that directory to `sands-lab/nika` on `gh-pages`, under `leaderboard/`, and deploys a redirect at the legacy `sands-lab.github.io/nika-leaderboard/` address.

Cross-repository publication requires `NIKA_PAGES_TOKEN`, a repository secret with `contents: write` access to `sands-lab/nika`. The separate NIKA website deployment must preserve `leaderboard/` (for example, with `keep_files: true`) rather than replacing the whole branch contents.
