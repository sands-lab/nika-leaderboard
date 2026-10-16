# ReAct + TelecomGPT-R1

Authors: NIKA Team

This entry uses the ReAct agent implemented with LangGraph through NIKA's
`byo.langgraph` integration, self-hosted `KU-DFI/TelecomGPT-R1` (27B), and the
standard NIKA MCP tools.

## Evaluation

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- All 255 slots finished: 238 scored submissions and 17 agent failures without submissions. Every failure reached the 100-step limit without a report; the 17 count as zero in primary means.
- Mean RCA F1: 0.2462188235 (24.62%).
- Mean localization F1: 0.3426811765 (34.27%).
- Mean detection score: 0.7372549020 (73.73%).
- Budgets: 100 steps, 32768 maximum output tokens, 14400-second agent timeout and 15000-second task timeout.
- No residual infrastructure or grading errors.

## Run provenance

All 255 trials ran at NIKA commit `ba4e78364b26b3a948c234e450c93df3e23090be`.
The model was served with vLLM 0.24 from revision
`f24b5120e225d582af5c4e5aa2cf226740de1ae7` in bf16. Serving context changed
during the run: 33 trials finished with a 131072-token context window, after
which a request exceeded that window and serving was raised to 262144 tokens
for the remaining 222 trials. The 33 completed trials were kept; every trial
that had not succeeded was rerun at 262144. The run metadata does not record
the serving context or precision.

## Links and model information

- [Agent and benchmark](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA.
- [Model checkpoint](https://huggingface.co/KU-DFI/TelecomGPT-R1)
- [Trajectories](https://huggingface.co/datasets/Zhihao98/nika-trajectories/tree/main/trajectories/0.2.0/20261013_react_telecomgpt_r1)

This submission reuses the leaderboard's reviewed `TelecomGPT-R1` catalog
entries: weight release date 2026-06-08 and the Featherless AI reference quote
retrieved 2026-10-13 (USD 1.60 per million input tokens and USD 12.00 per
million output tokens). The hosted quote estimates token costs; it does not
measure this run's GPU bill.
