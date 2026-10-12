# Claude Code + Gemma-4-31B-it

Authors: NIKA Team

This entry runs NIKA's `cli.claude` integration with Gemma-4-31B-it and the standard NIKA MCP tools.

## Evaluation

- Frozen release: nika-bench 0.2.0, test split, 85 cases with 3 trials each.
- All 255 trials finished with scored submissions.
- Recorded budgets: 100 steps, 32768 maximum output tokens, 14400-second agent timeout and 15000-second case timeout.
- Mean rca_f1: 0.3172003922.
- Mean localization_f1: 0.4419478431.
- Mean detection_score: 0.8745098039.

The run records NIKA commit `63912570d6fd1b0bc9647d6e299d68e642a36210` with local changes present.

## Links

- Agent and benchmark: https://github.com/sands-lab/nika
- Project site: https://sands-lab.github.io/nika/
- Benchmark paper: https://arxiv.org/abs/2512.16381

The benchmark paper describes NIKA.

## Model and trajectory packaging

- Model checkpoint: https://huggingface.co/google/gemma-4-31B-it
- Serving precision: BF16 (confirmed by the operator).
- Evaluated model revision and additional serving configuration were not recorded in the run metadata.
- The submission copy escapes Unicode line separators in JSONL strings. The original run files, decoded trajectory content, submissions, scores, and trial coverage remain unchanged.
- Model release date and hosted reference price require maintainer review; this submission does not infer them from another checkpoint.
