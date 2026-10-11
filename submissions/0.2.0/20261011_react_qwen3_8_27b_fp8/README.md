# ReAct + Qwen3.8-27B-FP8

Authors: NIKA Team

This entry uses the ReAct agent implemented with LangGraph through NIKA's
`byo.langgraph` integration, self-hosted Qwen3.8-27B-FP8, and the standard NIKA MCP tools.

## Evaluation

- Frozen release: nika-bench 0.2.0, test split, 85 cases with 3 trials each.
- Recorded budgets: 100 steps, 32768 maximum output tokens, 14400-second
  agent timeout and 15000-second case timeout.
- All 255 slots contain scored submissions, with no agent failures,
  infrastructure errors, or grading errors.
- Mean RCA F1: 0.49929098039215697 (49.93%).
- Mean localization F1: 0.5748525490196079 (57.49%).
- Mean detection score: 0.8549019607843137 (85.49%).

## Links

- Agent and benchmark: https://github.com/sands-lab/nika
- Project site: https://sands-lab.github.io/nika/
- Benchmark paper: https://arxiv.org/abs/2512.16381
- Model: https://huggingface.co/Qwen/Qwen3.8-27B-FP8
- Trajectories: https://huggingface.co/datasets/Zhihao98/nika-trajectories/tree/main/trajectories/0.2.0/20261011_react_qwen3_8_27b_fp8

The benchmark paper describes NIKA. It is not a separate report about this agent.
The leaderboard already contains model release and hosted reference-price metadata
for this checkpoint from the preceding Claude Code submission.

## Trajectory packaging

The packer removes machine-local paths and private keys from upload artifacts.
In trial `llmd_lab__host_ip_conflict__h7172cc7c30cf__t03`, we rephrased the
plain-text authentication description in the upload copy to avoid a
secret-scanner false positive. The replacement retains its meaning.
We preserved the original run, root causes, submissions, scores, and trial coverage.

For JSONL files whose path redaction damaged JSON escaping, we reapplied the
existing redaction rules to parsed source records and serialized them as valid JSON.
We also added a space before colons in single-letter labels followed by newlines
where the scanner mistook JSON newline escapes for Windows paths.
