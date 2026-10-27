# Codex + GPT-6 Astra (high)

Authors: NIKA Team

This entry uses NIKA's built-in `cli.codex` agent with OpenAI-hosted
GPT-6 Astra (`gpt-6-astra`) at `high` reasoning effort, and the standard NIKA
MCP tools. Codex authenticated with a ChatGPT subscription login, not an API
key. Each trial has separate diagnosis and structured-submission phases.
The agent ran in e2b sandboxes.

## Evaluation

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- All 255 slots finished: 239 scored submissions and 16 agent failures without
  submissions, which count as zero in primary means.
- Mean RCA F1: 0.6291513725 (62.92%).
- Mean localization F1: 0.7101972549 (71.02%).
- Mean detection score: 0.8352941176 (83.53%).
- Budgets: 100 steps, no maximum output-token override, 1800-second agent
  timeout and 2400-second task timeout.
- No residual infrastructure or grading errors.

### Agent failures

- Eleven trials produced a diagnosis report that called the case anomalous, but
  the submission phase declined to submit because it found no matching fault
  in the ontology:
  `enterprise_branch__healthy__m__t01`, `enterprise_branch__healthy__m__t02`,
  `enterprise_branch__healthy__m__t03`,
  `enterprise_branch__tcp_recei__h131c3a680384__t03`,
  `k8s_lab__bgp_asn_misconfig__he4a55dc53b83__t02`, `k8s_lab__healthy__t03`,
  `llmd_lab__host_ip_conflict__h7172cc7c30cf__t02`,
  `llmd_lab__host_missing_ip__h235346563fb5__t03`,
  `p4_dc_gateway__healthy__m__t03`,
  `p4_dc_gateway__http_acl_bloc__hcec9063e909a__t01` and
  `p4_dc_gateway__int_insuffici__h65e77e85f180__t01`.
- Four trials lost the sandbox command stream (read timeout) during the
  diagnosis phase, before a report was produced:
  `campus_lan__dhcp_service_dow__h46c12f643f13__t03`,
  `enterprise_branch__bgp_hijac__h93dd2b8e7404__t03`,
  `isp_abilene__bgp_max_prefix__hafac0c356cde__t03` and
  `k8s_lab__bgp_asn_misconfig__he4a55dc53b83__t03`.
- One trial completed its diagnosis report but lost the sandbox command stream
  (read timeout) during the submission phase: `dc_clos__healthy__s__t02`.

## Run provenance

The run used NIKA commit `769f952c06bc64f3006599d88316b0bd2318448f` with a
clean tree. The Codex CLI version was not recorded. Token usage was not
recorded for this run: the model-call log reports zero input and output tokens
for every call, so the package's token totals are zero. The leaderboard
estimates prices from reference rates and token counts, so no meaningful cost
estimate is available for this entry.

## Links and model information

- [Agent and benchmark](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA.
- [Trajectories](https://huggingface.co/datasets/nika-bench/nika-trajectories/tree/main/trajectories/0.2.0/20261027_codex_gpt_6_astra)
