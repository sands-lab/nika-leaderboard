# Codex + GPT-6.1 Sol (high)

Authors: Mariano Scazzariello

This entry uses NIKA's built-in `cli.codex` agent with OpenAI-hosted
GPT-6.1 Sol (`gpt-6.1-sol`) at `high` reasoning effort, and the standard NIKA
MCP tools. Codex authenticated with a ChatGPT subscription login, not an API
key. Each trial has separate diagnosis and structured-submission phases.
The agent ran in e2b sandboxes.

## Evaluation

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- All 255 slots finished: 249 scored submissions and 6 agent failures without
  submissions, which count as zero in primary means.
- Mean RCA F1: 0.8366023529 (83.66%).
- Mean localization F1: 0.9084976471 (90.85%).
- Mean detection score: 0.9294117647 (92.94%).
- Budgets: 100 steps, no maximum output-token override, 1800-second agent
  timeout and 2400-second task timeout.
- No residual infrastructure or grading errors.
- Run validity flags: 2 trials hit the 100-step limit with an empty diagnosis
  report (`empty_report`, `max_steps_exhausted`) but still submitted:
  `p4_dc_gateway__lb_pending_co__he9ad04263eac__t03` and
  `p4_dc_gateway__p4_ecn_thresh__h4bf62883ca88__t03`.

### Agent failures

All six agent failures finished the agent run without writing the required
submission:

- `campus_lan__dhcp_service_dow__h46c12f643f13__t02` (also an empty
  diagnosis report),
- `k8s_lab__healthy__t01`,
- `p4_dc_gateway__int_insuffici__h65e77e85f180__t03`,
- `p4_dc_gateway__lb_pending_co__he9ad04263eac__t01`,
- `p4_dc_gateway__lb_pending_co__he9ad04263eac__t02` and
- `p4_dc_gateway__silent_egress__h8eba7ba89f0d__t02`.

## Run provenance

- All 255 trials ran at NIKA commit
  `543fcae713ea58f3c3021ac6a5f74333a180cad1` (release 0.2.0 with the engine
  API v1 lifecycle protocol). The engine and frontend ran from that commit.
- The tree had one local change: the e2b sandbox egress probe was corrected to
  require a reply from the internet host, because e2b accepts TCP handshakes in
  isolated sandboxes and the unpatched probe rejected every sandbox. Isolation
  was confirmed with DNS and TLS checks in an isolated sandbox. The change does
  not affect the agent, the tasks, or scoring.
- One trial, `llmd_lab__healthy__t03`, failed while its lab was starting (a k3s
  node exited during startup), before the agent ran. It produced no outcome and
  was run again with `--resume`. No scored or agent-failed trial was rerun.
- The Codex CLI version was not recorded.
- Token totals: 123,450,354 input and 1,177,223 output tokens. The leaderboard
  estimates price from reference rates; the subscription cost is not the
  reference price.

## Links

- [Agent and benchmark](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA.
- [Trajectories](https://huggingface.co/datasets/nika-bench/nika-trajectories/tree/main/trajectories/0.2.0/20261127_codex_gpt_6_1_sol)
