# Codex + GPT-6.2 Sol (high)

Authors: NIKA Team

This entry uses NIKA's built-in `cli.codex` agent with OpenAI-hosted GPT-6.2 Sol (`gpt-6.2-sol`) at `high` reasoning effort, and the standard NIKA MCP tools. Codex authenticated with a ChatGPT subscription login, not an API key. Each trial has separate diagnosis and structured-submission phases. The agent ran in e2b sandboxes.

## Evaluation

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- All 255 slots finished: 239 scored submissions and 16 agent failures without submissions, which count as zero in primary means.
- Mean RCA F1: 0.6686290196 (66.86%).
- Mean localization F1: 0.7607862745 (76.08%).
- Mean detection score: 0.8666666667 (86.67%).
- Fault tasks (228 trials): mean RCA F1 0.6952. Healthy tasks (27 trials): mean detection score 0.4444.
- Budgets: 100 steps, no maximum output-token override, 1800-second agent timeout and 2400-second task timeout.
- No residual infrastructure or grading errors.
- Run validity flags: 13 trials hit the 100-step limit with an empty diagnosis report (`empty_report`, `max_steps_exhausted`); 11 of them are agent failures listed below, and 2 still submitted a diagnosis.

### Agent failures

- Eleven trials used the 100-step budget without a finding, and the submission phase declined to submit from the incomplete report: `campus_lan__device_forwardin__h0b9011ea426b__t01`, `enterprise_branch__healthy__m__t03`, `enterprise_branch__link_pack__ha7c5a53baacc__t02`, `isp_dfn-bwin_ebgp_rtbh__bgp__hb65dab9be18e__t01`, `isp_geant_ebgp_rpki__mtu_mis__h109c2a93c023__t02`, `isp_geant_ebgp_rpki__mtu_mis__h109c2a93c023__t03`, `p4_dc_gateway__lb_pending_co__he9ad04263eac__t02`, `p4_dc_gateway__p4_ecn_thresh__h4bf62883ca88__t01`, `p4_dc_gateway__p4_tcam_entry__hfd952409a6c1__t01`, `p4_dc_gateway__p4_tcam_entry__hfd952409a6c1__t03` and `p4_dc_gateway__tcp_syn_flood__hc408eaaa9f62__t01`.
- Four trials produced a report that called the case anomalous without naming a resource or fault type; `submit()` rejected an anomaly without a root cause and the agent did not resubmit: `campus_lan__device_forwardin__h0b9011ea426b__t03`, `dc_clos__receiver_resource_c__ha2be5b357067__t01`, `isp_di-yuan__link_capacity_b__h3f527f20073c__t03` and `llmd_lab__healthy__t03`.
- In one trial the submission phase stated that `submit()` was unavailable and made no tool call, although the task MCP server with `submit()` was offered to it: `p4_dc_gateway__host_incorrec__hb01d277c5754__t01`.

### Retried slots

Trials that failed before or outside the agent's control were rerun with `--resume`, as the runner does for `infra_failed` outcomes: four e2b egress-probe rejections before the agent started. No trial in this run ended on an endpoint error recorded as an agent failure.

## Run provenance

- NIKA commit `543fcae713ea58f3c3021ac6a5f74333a180cad1` (release 0.2.0 engine, API 1), clean tree, for all 255 trials.
- The Codex CLI version was not recorded.
- Token usage was recorded for every trial from the host's model-call records (diagnosis phase): 126,760,403 input and 1,336,193 output tokens in total. The leaderboard estimates prices from reference rates; the subscription cost of this run is not the reference price.

## Links

- [Agent and benchmark](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA.
- [Trajectories](https://huggingface.co/datasets/nika-bench/nika-trajectories/tree/main/trajectories/0.2.0/20261126_codex_gpt_6_2_sol)
