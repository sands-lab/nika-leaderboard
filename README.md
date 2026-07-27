# NIKA Leaderboard

Official submission archive for [NIKA](https://github.com/sands-lab/nika).

Pack, validate, and open a PR with the NIKA CLI. Full instructions, package layout, metadata schema, and PR checklist:

**[docs/leaderboard-submission.md](https://github.com/sands-lab/nika/blob/main/docs/leaderboard-submission.md)**

```shell
nika leaderboard submit path/to/YYYYMMDD_slug
```

Submissions land under `submissions/<release_version>/{YYYYMMDD}_{slug}/`. CI re-runs `nika leaderboard validate` on PRs that touch `submissions/`.
