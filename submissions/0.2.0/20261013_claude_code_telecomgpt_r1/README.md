# Claude Code + TelecomGPT-R1

Authors: NIKA Team

This entry uses NIKA's `cli.claude` integration with self-hosted
`KU-DFI/TelecomGPT-R1` (27B) and the standard NIKA MCP tools.

## Evaluation

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- All 255 slots finished: 245 scored submissions and 10 agent failures without submissions. The 10 failures count as zero in primary means.
- Mean RCA F1: 0.2463792157 (24.64%).
- Mean localization F1: 0.3348694118 (33.49%).
- Mean detection score: 0.8156862745 (81.57%).
- Budgets: 100 steps, 32768 maximum output tokens, 14400-second agent timeout and 15000-second task timeout.
- No residual infrastructure or grading errors.

## Run provenance

Twelve trials ran at NIKA commit `a21f54a82d83d81228133ac17315c3084a4748a8`
and 243 at `ba4e78364b26b3a948c234e450c93df3e23090be`. The intervening
change repairs Kathara TAP ownership in BusyBox containers. The benchmark
release definitions are unchanged, and all runtime task fingerprints match the
current release. The model revision and serving precision are not recorded
in the run metadata.

## Links and model information

- [Agent and benchmark](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA.
- [Model checkpoint](https://huggingface.co/KU-DFI/TelecomGPT-R1)
- [Trajectories](https://huggingface.co/datasets/Zhihao98/nika-trajectories/tree/main/trajectories/0.2.0/20261013_claude_code_telecomgpt_r1)

Model weights release date: 2026-06-08. The [first complete weight upload](https://huggingface.co/KU-DFI/TelecomGPT-R1/commit/99f638ac5691b0ed9e21fffbe1d9308af0205280)
contains both safetensors shards. Earlier snapshots contain metadata without weights;
the repository creation date is not the weight release date.

Reference quote retrieved 2026-10-13: Featherless AI, USD 1.60 per million
input tokens and USD 12.00 per million output tokens. Sources:
[model page](https://featherless.ai/models/KU-DFI/TelecomGPT-R1) and
[public model API](https://api.featherless.ai/v1/models/KU-DFI%2FTelecomGPT-R1).
The provider does not specify serving precision in this quote. This is a
hosted reference estimate, not the self-hosted GPU bill; cached-input discounts
are not applied.
