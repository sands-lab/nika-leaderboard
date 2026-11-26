# Codex + GPT-6.2 Astra (high)

Authors: NIKA Team

This entry uses NIKA's built-in `cli.codex` agent with OpenAI-hosted GPT-6.2 Astra (`gpt-6.2-astra`) at `high` reasoning effort, and the standard NIKA MCP tools. Codex authenticated with a ChatGPT subscription login, not an API key. Each trial has separate diagnosis and structured-submission phases. The agent ran in e2b sandboxes.

## Evaluation

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- All 255 slots finished: 246 scored submissions and 9 agent failures without submissions, which count as zero in primary means.
- Mean RCA F1: 0.8156874510 (81.57%).
- Mean localization F1: 0.8509815686 (85.10%).
- Mean detection score: 0.9333333333 (93.33%).
- Fault tasks (228 trials): mean RCA F1 0.8465. Healthy tasks (27 trials): mean detection score 0.5556.
- Budgets: 100 steps, no maximum output-token override, 1800-second agent timeout and 2400-second task timeout.
- No residual infrastructure or grading errors.
- Run validity flags: 4 trials hit the 100-step limit with an empty diagnosis report (`empty_report`, `max_steps_exhausted`); all four are agent failures listed below.

### Agent failures

- Four trials used the 100-step budget without a finding, and the submission phase declined to submit from the empty report: `p4_dc_gateway__p4_ecn_thresh__h4bf62883ca88__t01`, `p4_dc_gateway__p4_ecn_thresh__h4bf62883ca88__t03`, `p4_dc_gateway__silent_egress__h8eba7ba89f0d__t02` and `p4_dc_gateway__silent_egress__h8eba7ba89f0d__t03`.
- Five healthy-task trials produced a report that called the network anomalous without naming a resource or fault type; `submit()` rejected an anomaly without a root cause and the agent did not resubmit: `enterprise_branch__healthy__m__t02`, `sdn_l3_clos__healthy__l__t03`, `sdn_l3_clos__healthy__m__t01`, `sdn_l3_clos__healthy__m__t02` and `sdn_l3_clos__healthy__m__t03`.

### Retried slots

Trials that failed before or outside the agent's control were rerun with `--resume`, as the runner does for `endpoint_failed` and `infra_failed` outcomes: subscription `429` responses, `k8s_lab` start-up timeouts on a loaded host, one load-balancer baseline probe timeout, and one e2b egress-probe rejection.

Four further trials ended when the OpenAI endpoint returned `Selected model is at capacity` inside an HTTP 200 response stream. NIKA's outcome classifier at this commit does not recognize that message, so it recorded them as `agent_failed`. Their first attempts were moved aside unchanged and the slots were rerun; the first attempts are not part of this package: `enterprise_branch__link_pack__ha7c5a53baacc__t03`, `isp_di-yuan__link_capacity_b__h3f527f20073c__t03`, `p4_dc_gateway__lb_pending_co__he9ad04263eac__t03` and `p4_dc_gateway__p4_ecmp_group__hee7f0e686145__t03`.

## Run provenance

- NIKA commit `543fcae713ea58f3c3021ac6a5f74333a180cad1` (release 0.2.0 engine, API 1), clean tree, for all 255 trials.
- The Codex CLI version was not recorded.
- Token usage was recorded for every trial from the host's model-call records (diagnosis phase): 71,935,770 input and 690,001 output tokens in total. The leaderboard estimates prices from reference rates; the subscription cost of this run is not the reference price.

## Links

- [Agent and benchmark](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA.
- [Trajectories](https://huggingface.co/datasets/nika-bench/nika-trajectories/tree/main/trajectories/0.2.0/20261126_codex_gpt_6_2_astra)
