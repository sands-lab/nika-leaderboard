# Codex + GPT-6.1 Sol (high)

Authors: NIKA Team

This entry uses NIKA's built-in `cli.codex` agent with OpenAI-hosted
GPT-6.1 Sol (`gpt-6.1-sol`) at `high` reasoning effort, and the standard NIKA
MCP tools. Codex authenticated with a ChatGPT subscription login, not an API
key. Each trial has separate diagnosis and structured-submission phases.
The agent ran in e2b sandboxes.

## Evaluation

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- All 255 slots finished: 245 scored submissions and 10 agent failures without
  submissions, which count as zero in primary means.
- Mean RCA F1: 0.6841192157 (68.41%).
- Mean localization F1: 0.7547729412 (75.48%).
- Mean detection score: 0.8549019608 (85.49%).
- Budgets: 100 steps, no maximum output-token override, 1800-second agent
  timeout and 2400-second task timeout.
- No residual infrastructure or grading errors.

### Agent failures

- Five trials produced a diagnosis report, but the submission phase declined to
  submit because it found no matching fault in the ontology:
  `enterprise_branch__healthy__m__t01`, `enterprise_branch__healthy__m__t02`,
  `enterprise_branch__tcp_recei__h131c3a680384__t01`,
  `enterprise_branch__tcp_recei__h131c3a680384__t02` and
  `p4_dc_gateway__lb_pending_co__he9ad04263eac__t01`.
- Two trials hit the 100-step limit without a diagnosis report:
  `p4_dc_gateway__icmp_frag_nee__ha855b5fd985e__t03` and
  `p4_dc_gateway__int_insuffici__h65e77e85f180__t02`.
- One trial hit the step limit, and its submission phase then failed with
  "Selected model is at capacity":
  `p4_dc_gateway__silent_egress__h8eba7ba89f0d__t01`.
- Two trials lost the sandbox command stream (connection reset or timeout),
  which truncated the diagnosis report:
  `p4_dc_gateway__p4_table_reso__h2bab5479b819__t01` and
  `p4_dc_gateway__p4runtime_par__h92346d5301fa__t03`.

## Run provenance

The run used NIKA commit `5096d23a3b79cd0d425d65ef1ebcb647ac2e8918` with local
changes present. The Codex CLI version was not recorded.

## Links and model information

- [Agent and benchmark](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA.
- [Model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol)

Model release date: 2026-09-29
([announcement](https://openai.com/index/introducing-gpt-6-1-sol/)).

Reference price retrieved 2026-10-17: OpenAI API standard tier, USD 2.00 per
million input tokens and USD 10.00 per million output tokens (USD 0.10 per
million cached input tokens, not applied). Source:
[model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol). The run
used a ChatGPT subscription, so this is a reference estimate, not the amount
billed.
