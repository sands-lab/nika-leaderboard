# Codex + GPT-6 Astra (high)

Authors: Mariano Scazzariello

This entry uses NIKA's built-in `cli.codex` agent with OpenAI-hosted
GPT-6 Astra (`gpt-6-astra`) at `high` reasoning effort, and the standard NIKA
MCP tools. Codex authenticated with a ChatGPT subscription login, not an API
key. Each trial has separate diagnosis and structured-submission phases.
The agent ran in e2b sandboxes.

## Evaluation

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- All 255 slots finished: 239 scored submissions and 16 agent failures without
  submissions, which count as zero in primary means.
- Mean RCA F1: 0.6725501961 (67.26%).
- Mean localization F1: 0.7457529412 (74.58%).
- Mean detection score: 0.8470588235 (84.71%).
- Budgets: 100 steps, no maximum output-token override, 1800-second agent
  timeout and 2400-second task timeout.
- No residual infrastructure or grading errors.
- Run validity flags: 4 trials hit the 100-step limit with an empty diagnosis
  report (`empty_report`, `max_steps_exhausted`):
  `p4_dc_gateway__http_acl_bloc__hcec9063e909a__t01` (also an agent failure),
  `p4_dc_gateway__int_insuffici__h65e77e85f180__t02`,
  `p4_dc_gateway__int_insuffici__h65e77e85f180__t03` and
  `p4_dc_gateway__p4_tcam_entry__hfd952409a6c1__t03`.

### Agent failures

- Thirteen trials produced a diagnosis report that called the case anomalous,
  but the submission phase declined to submit because it found no matching
  fault in the ontology:
  `enterprise_branch__healthy__m__t01`, `enterprise_branch__healthy__m__t02`,
  `enterprise_branch__healthy__m__t03`,
  `enterprise_branch__tcp_recei__h131c3a680384__t03`,
  `isp_di-yuan__link_capacity_b__h3f527f20073c__t03`,
  `isp_geant_ebgp_rpki__mtu_mis__h109c2a93c023__t01`,
  `k8s_lab__bgp_asn_misconfig__he4a55dc53b83__t02`, `k8s_lab__healthy__t03`,
  `llmd_lab__host_ip_conflict__h7172cc7c30cf__t02`,
  `llmd_lab__host_missing_ip__h235346563fb5__t03`,
  `p4_dc_gateway__healthy__m__t03`,
  `p4_dc_gateway__http_acl_bloc__hcec9063e909a__t01` and
  `p4_dc_gateway__int_insuffici__h65e77e85f180__t01`.
- Two trials lost the sandbox command stream (read timeout) during the
  diagnosis phase, before a report was produced:
  `campus_lan__dhcp_service_dow__h46c12f643f13__t03` and
  `k8s_lab__bgp_asn_misconfig__he4a55dc53b83__t03`.
- One trial completed its diagnosis report but lost the sandbox command stream
  (read timeout) during the submission phase: `dc_clos__healthy__s__t02`.

## Run provenance

The run was resumed across two NIKA commits, both recorded in the run's
`nika_git_history`:

- 234 trials ran at commit `769f952c06bc64f3006599d88316b0bd2318448f` with a
  clean tree.
- 21 trials (7 tasks) ran at commit `86256da3bbef613952bd55fcf064ccbc189d616e`.
  Release 0.2.0 was repaired in place between the two commits (#275): five
  tasks got new case IDs and two kept their IDs but changed ground truth. These
  tasks were rerun; their earlier trials are not part of this package:
  `enterprise_branch__bgp_hijac__h4ee5d8e07e75`,
  `isp_abilene__bgp_max_prefix__h3f31ac15a8fa`,
  `isp_di-yuan__link_capacity_b__h3f527f20073c`,
  `isp_geant_ebgp_rpki__bgp_rpk__h084f2b27c006`,
  `isp_geant_ebgp_rpki__mtu_mis__h109c2a93c023`,
  `llmd_lab__k8s_coredns_isolat__h7de12dd02b9a` and
  `p4_dc_fabric__incast_traffic__haee9406964cc`.
  The tree had one local change: the e2b sandbox egress probe was corrected to
  require a reply from the internet host, because e2b accepts TCP handshakes in
  isolated sandboxes and the earlier probe rejected every sandbox. The change
  does not affect the agent, the tasks, or scoring.

The Codex CLI version was not recorded. Token usage was recorded only for the
21 trials run at `86256da3`, which counts token usage in streamed model calls;
the 234 earlier trials report zero tokens. The package's token totals
(7,535,963 input and 66,767 output tokens) therefore cover only those 21
trials, and the leaderboard's reference-rate price estimate understates the
run's cost.

## Links

- [Agent and benchmark](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA.
- [Trajectories](https://huggingface.co/datasets/nika-bench/nika-trajectories/tree/main/trajectories/0.2.0/20261028_codex_gpt_6_astra)
