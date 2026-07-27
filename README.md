# NIKA Leaderboard

Official submission archive for the [NIKA](https://github.com/sands-lab/nika) network troubleshooting benchmark.

Submissions are packaged locally with `nika leaderboard pack`, validated with `nika leaderboard validate`, and opened as pull requests with `nika leaderboard submit`. See the [submission guide](https://github.com/sands-lab/nika/blob/main/docs/leaderboard-submission.md).

## Layout

```text
submissions/
  <release_version>/          # e.g. 0.1.0
    {YYYYMMDD}_{slug}/
      README.md
      metadata.yaml
      files.json
      results/
        identity.yaml
        metrics.json
        trials/
          {trial_id}/result.json
```

## How to submit

1. Run an official release (`nika benchmark run --release …`).
2. Fill templates, pack, and validate locally.
3. Install and authenticate [`gh`](https://cli.github.com/) (`gh auth login`).
4. Run:

```shell
nika leaderboard submit path/to/YYYYMMDD_slug
```

This opens a PR against this repository. CI re-runs `nika leaderboard validate` on new packages under `submissions/`.

## Review checklist

See [checklist.md](checklist.md).
