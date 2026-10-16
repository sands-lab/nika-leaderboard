# Claude Opus 5.5

NIKA's built-in `cli.claude` agent uses Claude Code CLI 2.1.280 with Anthropic-hosted
Claude Opus 5.5 through subscription authentication. Each trial has separate diagnosis
and structured-submission phases, using the benchmark release's allowed MCP servers.
The runtime model identifier is `claude-opus-5-5`.

This is an official NIKA release 0.2.0 `test` run: 85 tasks with three trials each,
for 255 scored trials. It used NIKA commit
`dba357b3c0c6585f68d059a531c12619f8e9b3b3` with a clean checkout.

## Configuration

- Batch size: 8; heavy batch size: 1.
- Maximum Claude Code turns: 20 per phase.
- Maximum output tokens: 8,192 per model response.
- Agent timeout: 1,800 seconds; entire-trial timeout: 2,400 seconds.
- No custom skills or optimization methods are declared in this submission.

Two trials encountered sandbox-start failures before the agent ran. A single guarded
`--resume` pass retried only those unscored trials. None of the 253 already-scored trials
was repeated. The final outcomes are 237 `success` and 18 `agent_failed`; completion
status and diagnostic correctness are separate measurements.

## Known caveat

In all three `p4_dc_gateway / tcp_syn_flood` trials, a container-limited Python process
was OOM-killed about 70 seconds after injection, and INT telemetry stopped updating.
Code, memory limits, and timing strongly indicate the INT collector (`collector.py`,
256 MiB container), which retains reports in an unbounded in-memory dictionary.
Direct PID-to-container attribution was unavailable after teardown.

Fault-presence checks confirmed that flood-generator processes remained alive; they
did not measure the actual traffic rate. Interpret this task's results with the
stale-telemetry caveat. The original trial results and trajectories are unchanged.

## Links

- Code: https://github.com/sands-lab/nika
- Model: https://www.anthropic.com/claude-opus-5-5

## Authors

- Alessandro Cornacchia
