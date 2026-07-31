---
name: submit
description: Create and validate NIKA leaderboard submission packages from a NIKA checkout.
---

# NIKA Submission Workflow

`<NIKA_ROOT>` denotes the root of a local checkout of `https://github.com/sands-lab/nika`.

## Creating a Package

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

## Validation

From the NIKA checkout, validate every package touched by the change:

```shell
cd <NIKA_ROOT>
uv run nika leaderboard validate \
  <NIKA_LEADERBOARD_ROOT>/submissions/<release_version>/<package>
```

When the original run is available, also pass `--source-result-dir` so the source `run.json` hash is checked.

Validation checks schema version 1, the frozen release manifest, exact trial coverage, recomputed aggregate metrics, package hashes, official-run identity, secrets, and absolute paths. A visual review or JSON/YAML parse alone is not sufficient.

The PR workflow installs Python 3.12 and an editable checkout of `sands-lab/nika`, using repository variable `NIKA_REF` when set and otherwise `main`. If local validation and CI disagree, compare the local NIKA commit with that ref before changing submission data.
