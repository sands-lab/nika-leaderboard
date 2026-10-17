# Claude Haiku 5.5

NIKA's built-in `cli.claude` agent uses Claude Code CLI 2.1.280 with Anthropic-hosted
Claude Haiku 5.5 through subscription authentication. Each trial has separate diagnosis
and structured-submission phases, using the benchmark release's allowed MCP servers.
The runtime model identifier is `claude-haiku-5-5`.

This is an official NIKA release 0.2.0 `test` run: 85 tasks with three trials each,
for 255 scored trials. It used NIKA commit
`dba357b3c0c6585f68d059a531c12619f8e9b3b3` with a clean checkout.

## Configuration

- Batch size: 16; heavy batch size: 1.
- Maximum Claude Code turns: 100 per phase.
- Maximum output tokens: 8,192 per model response.
- Agent timeout: 1,800 seconds; entire-trial timeout: 2,400 seconds.
- No custom skills or optimization methods are declared in this submission.

Five trials encountered infrastructure failures before the agent ran: three sandbox-start
failures and two lab-startup failures. A single guarded `--resume` pass retried only those
unscored trials. None of the 250 already-scored trials was repeated.

The final outcomes are 253 `success` and two `agent_failed`. In the two agent failures,
the agent invoked the built-in `init` skill and wrote a `CLAUDE.md` file instead of
completing the network diagnosis. No answer was submitted. These trials remain scored
failures in the submitted results; they were not retried or excluded. Execution status
and diagnostic correctness are separate measurements.

## Known caveat

In all three `p4_dc_gateway / tcp_syn_flood` trials, a container-limited Python process
was OOM-killed shortly after injection. Code, memory limits, and timing strongly indicate
the INT collector (`collector.py`, 256 MiB container), which retains reports in an
unbounded in-memory dictionary. Direct PID-to-container attribution was unavailable
after teardown. The last INT-report timestamp was not retained, so loss of fresh
telemetry is inferred rather than directly measured.

Fault-presence checks confirmed that flood-generator processes remained alive; they
did not measure the actual traffic rate. Interpret this task's results with the
potentially stale or missing telemetry caveat. The original results and trajectories
are unchanged. Investigation: https://github.com/sands-lab/nika/issues/202.

## Links

- Code: https://github.com/sands-lab/nika
- Model: https://www.anthropic.com/claude-haiku-5-5

## Authors

- Alessandro Cornacchia
