# Claude Code + Qwen3.8-27B-FP8

Authors: NIKA Team

This entry uses Claude Code through NIKA's `cli.claude` integration with
self-hosted Qwen3.8-27B-FP8 and the standard NIKA MCP tools.

## Evaluation

- Frozen release: nika-bench 0.2.0, test split, 85 cases with 3 trials each.
- Recorded budgets: 100 steps, 8192 maximum output tokens, 14400-second
  agent timeout and 15000-second case timeout.
- All 255 slots are finished: 252 scored submissions and 3 agent failures.
- Mean RCA F1: 0.5529968627450983 (55.30%).

## Links

- Agent and benchmark: https://github.com/sands-lab/nika
- Project site: https://sands-lab.github.io/nika/
- Benchmark paper: https://arxiv.org/abs/2512.16381
- Model: https://huggingface.co/Qwen/Qwen3.8-27B-FP8
- Trajectories: https://huggingface.co/datasets/Zhihao98/nika-trajectories/tree/main/trajectories/0.2.0/20261010_claude_code_qwen3_8_27b_fp8

## Display metadata correction

The follow-up correction supplies project links, the Claude Code harness name,
and tools and budgets from the recorded run. Scores, trial files, identity,
and benchmark coverage remain the original submission's generated artifacts.

## Model release and reference price

- Released weights: 2026-08-13. Source: https://huggingface.co/Qwen/Qwen3.8-27B-FP8/commit/10b09acb2fdc08d52017d17c1e3d42845fba3f4f
- Reference quote, retrieved 2026-10-10: OpenRouter Qwen3.8-27B: $0.425 input / $2.55 output per million tokens. Source: https://openrouter.ai/qwen/qwen3.8-27b. The run used FP8 weights.

The leaderboard derives a hosted reference estimate from recorded token counts.
It does not measure this self-hosted run's GPU bill or apply cache discounts.
