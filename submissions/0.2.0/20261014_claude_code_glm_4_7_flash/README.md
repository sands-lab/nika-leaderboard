# Claude Code + GLM-4.7-Flash

Authors: NIKA Team

This entry uses NIKA's `cli.claude` integration with self-hosted
`zai-org/GLM-4.7-Flash` and the standard NIKA MCP tools.

## Evaluation

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- All 255 slots finished: 242 scored submissions and 13 agent failures without submissions. The failures ended without a usable report or without calling the submission tool; the 13 count as zero in primary means.
- Mean RCA F1: 0.1117341176 (11.17%).
- Mean localization F1: 0.2054305882 (20.54%).
- Mean detection score: 0.7921568627 (79.22%).
- Budgets: 100 steps, 32768 maximum output tokens, 14400-second agent timeout and 15000-second task timeout.
- No residual infrastructure or grading errors.

## Run provenance

All 255 trials ran at NIKA commit `ba4e78364b26b3a948c234e450c93df3e23090be`.
The model was served with vLLM 0.24 from revision
`7dd20894a642a0aa287e9827cb1a1f7f91386b67` in bf16 with a 202752-token context
window and piecewise CUDA graphs. The run metadata does not record the serving
context or precision.

Nine trials that ended diagnosis within two turns were rerun once.

## Links and model information

- [Agent and benchmark](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA.
- [Model checkpoint](https://huggingface.co/zai-org/GLM-4.7-Flash)
- [Trajectories](https://huggingface.co/datasets/Zhihao98/nika-trajectories/tree/main/trajectories/0.2.0/20261014_claude_code_glm_4_7_flash)

Model weights release date: 2026-01-19. The
[first weight upload](https://huggingface.co/zai-org/GLM-4.7-Flash/commit/75fce703a93da3705c4cf8d3caadbac1d1072c78)
contains the safetensors shards.

Reference quote retrieved 2026-10-14: OpenRouter, USD 0.0605 per million input
tokens and USD 0.40 per million output tokens. Sources:
[model page](https://openrouter.ai/z-ai/glm-4.7-flash) and
[public model API](https://openrouter.ai/api/v1/models). This is a hosted
reference estimate, not the self-hosted GPU bill; cached-input discounts are
not applied.
