# Claude Code + GPT-OSS-120B

Authors: NIKA Team

This entry uses NIKA's `cli.claude` integration with self-hosted
`openai/gpt-oss-120b`, served with Ollama (`ollama run gpt-oss:120b`), and the
standard NIKA MCP tools.

## Evaluation

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- All 255 slots finished: 253 scored submissions and 2 agent failures without
  submissions. Both failures hit the 100-step limit without an assistant report
  (`dc_clos__arp_acl_block__m__heebcdfb08b4d__t01`,
  `campus_lan__dhcp_spoofed_dns__h4ee0ce80b947__t01`); they count as zero in
  primary means.
- Mean RCA F1: 0.2683854902 (26.84%).
- Mean localization F1: 0.3670258824 (36.70%).
- Mean detection score: 0.7803921569 (78.04%).
- Budgets: 100 steps, 8192 maximum output tokens, 1800-second agent timeout and
  2400-second task timeout.
- No residual infrastructure or grading errors.

## Run provenance

The run started at NIKA commit `ca0d5b9a15936aab8ae8a48d6e51af136c83a2a4` and
was resumed at `384907e6e025b0068973a9b2161b8b7f75734145` and
`5096d23a3b79cd0d425d65ef1ebcb647ac2e8918`, the latter two with local changes
present.

The model was served with `ollama run gpt-oss:120b` using Ollama's default
settings, with the checkpoint's native MXFP4 weights. The Ollama tag digest was
not recorded.

## Links and model information

- [Agent and benchmark](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA.
- [Model checkpoint](https://huggingface.co/openai/gpt-oss-120b)
- [Trajectories](https://huggingface.co/datasets/Zhihao98/nika-trajectories/tree/main/trajectories/0.2.0/20261016_claude_code_gpt_oss_120b)

Model weights release date: 2025-08-05
([announcement](https://openai.com/index/introducing-gpt-oss/)).

Reference quote retrieved 2026-10-16: OpenRouter, USD 0.15 per million input
tokens and USD 0.60 per million output tokens. Sources:
[model page](https://openrouter.ai/openai/gpt-oss-120b) and
[public model API](https://openrouter.ai/api/v1/models). This is a hosted
reference estimate, not the self-hosted GPU bill; cached-input discounts are
not applied.
