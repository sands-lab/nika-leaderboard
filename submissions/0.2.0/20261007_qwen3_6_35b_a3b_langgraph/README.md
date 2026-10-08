# Qwen3.6-35B-A3B LangGraph

LangGraph ReAct-style agent (NIKA `byo.langgraph` harness) driven by Qwen3.6-35B-A3B (FP8 weights, served through an OpenAI-compatible endpoint).

- Benchmark: nika-bench 0.2.0, test split, 85 cases × 3 trials
- Limits: max 100 steps, 8192 max output tokens, 7200 s agent timeout per trial
- Harness: stock NIKA agent `byo.langgraph`, no prompt optimization, skills, or fine-tuning

Authors: NIKA Team. Code: https://github.com/sands-lab/nika
