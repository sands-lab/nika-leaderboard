# Claude Code + Qwen3-Coder-Next

Authors: NIKA Team

This entry uses NIKA's `cli.claude` integration with self-hosted
`Qwen/Qwen3-Coder-Next-FP8` and the standard NIKA MCP tools.

## Evaluation

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- All 255 slots finished: 254 scored submissions and 1 agent failure without a submission, which counts as zero in primary means.
- Mean RCA F1: 0.1923976471 (19.24%).
- Mean localization F1: 0.3154552941 (31.55%).
- Mean detection score: 0.8156862745 (81.57%).
- Budgets: 100 steps, 8192 maximum output tokens, 1800-second agent timeout and 2400-second task timeout.
- No residual infrastructure or grading errors.

## Run provenance

The run used NIKA's opt-in Firecracker execution mode (`nika.execution: firecracker`,
huge pages, added in [sands-lab/nika#204](https://github.com/sands-lab/nika/pull/204), merged as `4541af7e`):
each trial restored a verified lab image, re-ran startup verification, and then
injected its failure; the agent and its sandbox ran on the host. Trials ran at
three commits of that branch: `0c9b5e35` (85 trials), `9556bdd0` (160) and
`4f654ae6` (10). The later commits change only lab image scheduling, verification
concurrency on hosts with fewer than 8 CPUs, and a MetalLB startup retry; they do
not change tasks, injection, tools or scoring.

Nine trials whose lab VMs crashed when the host's huge-page pool ran out
(`endpoint_failed` / `error`, not scored) were rerun once after the scheduling fix.

The model was served with vLLM 0.24 from revision
`da6e2ed27304dd39abadd9c82ef50e8de67bdd4c` with FP8 weights, a 262144-token context
window and tensor parallelism over two A100 80GB GPUs.

## Links and model information

- [Agent and benchmark](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA.
- [Model checkpoint](https://huggingface.co/Qwen/Qwen3-Coder-Next-FP8)

Reference quote retrieved 2026-10-18: OpenRouter, USD 0.12 per million input
tokens and USD 0.80 per million output tokens. Sources:
[model page](https://openrouter.ai/qwen/qwen3-coder-next) and
[public model API](https://openrouter.ai/api/v1/models). This is a hosted
reference estimate, not the self-hosted GPU bill; cached-input discounts are
not applied.
