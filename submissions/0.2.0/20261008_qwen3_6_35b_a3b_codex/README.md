# Qwen3.6-35B-A3B Codex

Codex CLI agent (NIKA `cli.codex` harness, MCP tools) driven by Qwen3.6-35B-A3B (FP8 weights, served through an OpenAI-compatible endpoint).

- Benchmark: nika-bench 0.2.0, test split, 85 cases × 3 trials
- Limits: max 100 steps, 7200 s agent timeout per trial
- Harness: stock NIKA agent `cli.codex`, no prompt optimization, skills, or fine-tuning

Authors: NIKA Team. Code: https://github.com/sands-lab/nika
