# Claude Code + Qwen3.5-27B

Authors: NIKA Team

This entry uses NIKA's `cli.claude` integration with self-hosted
`Qwen/Qwen3.5-27B` and the standard NIKA MCP tools.

## Evaluation

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- All 255 slots finished: 254 scored submissions and 1 agent failure without submissions. The agent failure finished diagnosis but did not call the submission tool, so it produced no submission; it counts as zero in primary means.
- Mean RCA F1: 0.3181474510 (31.81%).
- Mean localization F1: 0.4487803922 (44.88%).
- Mean detection score: 0.8666666667 (86.67%).
- Budgets: 100 steps, 32768 maximum output tokens, 14400-second agent timeout and 15000-second task timeout.
- No residual infrastructure or grading errors.

## Run provenance

All 255 trials ran at NIKA commit `ba4e78364b26b3a948c234e450c93df3e23090be`.
The model was served with vLLM 0.24 from revision
`fc05daec18b0a78c049392ed2e771dde82bdf654` in bf16 with a 262144-token context
window. The run metadata does not record the serving context or precision.

## Links and model information

- [Agent and benchmark](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA.
- [Model checkpoint](https://huggingface.co/Qwen/Qwen3.5-27B)
- [Trajectories](https://huggingface.co/datasets/Zhihao98/nika-trajectories/tree/main/trajectories/0.2.0/20261014_claude_code_qwen3_5_27b)

This submission reuses the leaderboard's reviewed `Qwen3.5-27B` catalog
entries: release date 2026-02-24, sourced from the
[Qwen3.5 release](https://github.com/QwenLM/Qwen3.5), and the
[OpenRouter reference quote](https://openrouter.ai/qwen/qwen3.5-27b) retrieved
on 2026-10-08 (USD 0.26 per million input tokens and USD 2.60 per million
output tokens). The hosted quote estimates token costs; it does not measure
this run's GPU bill.
