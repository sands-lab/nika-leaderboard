# Claude Code + Claude Sonnet 5.5

NIKA's built-in `cli.claude` agent: Claude Code CLI (2.1.280) running in a Docker Sandbox, in two
phases (diagnosis, then submission), with the release's allowed MCP servers. The model is the
Anthropic-hosted `claude-sonnet-5-5`, accessed with Claude subscription authentication.

Run: nika-bench 0.2.0, `test` split, 85 cases x 3 trials (255 trials), official release run.
Settings: `--max-steps 100` (Claude Code `--max-turns 100` per phase), max output tokens 8192,
agent timeout 1800 s, case timeout 2400 s, `--batch-size 16 --heavy-batch-size 1`,
NIKA commit `dba357b3c0c6585f68d059a531c12619f8e9b3b3`.

Three trials hit infrastructure failures before the agent ran (two lab-startup failures and one
sandbox-start failure); they were retried once with NIKA's `--resume`, which skips every scored
trial. No scored trial was re-run.

## Known caveat

In all three trials of `p4_dc_gateway / tcp_syn_flood`, a container-limited Python process was
OOM-killed about 70 s after injection, and INT telemetry stopped updating. Code, memory limits,
and timing strongly indicate the INT collector (`collector.py`, 256 MiB container), which retains
reports in an unbounded in-memory dictionary. Direct PID-to-container attribution was unavailable
after teardown. The same pattern was observed in the earlier Opus run.

Fault-presence checks confirmed that flood-generator processes remained alive; they did not
measure the actual traffic rate. Interpret results for this task with the stale-telemetry caveat.

## Links

- Code / library: https://github.com/sands-lab/nika

## Authors

- Alessandro Cornacchia

## Results and reference pricing

All 255 trials contain scored submissions, with no residual infrastructure or
grading errors. Mean RCA F1 is 73.43%, localization F1 is 76.94%, and detection
score is 85.10%.

Anthropic released Claude Sonnet 5.5 on 2026-09-28. Its standard API list price
is USD 2 per million input tokens and USD 10 per million output tokens, retrieved
2026-10-16 from the [official release page](https://www.anthropic.com/claude-sonnet-5-5).
The leaderboard uses these rates as a token-price reference for this subscription-
authenticated run. It does not measure the subscription bill or apply cache discounts.

[Paired trajectories](https://huggingface.co/datasets/Zhihao98/nika-trajectories/tree/main/trajectories/0.2.0/20261016_claude_code_claude_sonnet_5_5).
