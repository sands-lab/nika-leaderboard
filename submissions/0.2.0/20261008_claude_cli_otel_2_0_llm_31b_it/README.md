# Claude CLI + OTel-2.0-LLM-31B-IT

Authors: zhihao1998

This entry runs NIKA's `cli.claude` agent with the self-hosted
`farbodtavakkoli/OTel-2.0-LLM-31B-IT` model and NIKA's standard MCP tools.
The model endpoint uses the OpenAI-compatible API; the agent framework is
Claude CLI, not a Claude model.

## Evaluation

- Frozen release: nika-bench 0.2.0, test split, 85 cases with 3 trials each.
- Agent budget: 100 steps, 8192 maximum output tokens, 1800-second agent timeout.
- Case timeout: 2400 seconds. Final scheduling used light batch 6 and heavy batch 2.
- Serving: vLLM, BF16 weights, tensor parallel size 4 on A100 40GB GPUs,
  65536-token context, Gemma 4 reasoning and tool-call parsers.
- Model revision: `de9c87a5681a4d6dce4ea2419eec8a2aadd5e071`.

## Run history and failures

The serving configuration was adjusted during this run. In particular,
`enable_thinking=true` was set explicitly after initial trials; earlier trials
used the prior serving defaults. The trajectories retain the recorded run history.

The backend ran as preemptible Slurm jobs. We replaced one deployment-error
trial and 14 trials selected for terminal backend 503 errors or timeouts with
long model-response waits. Two of those trials were repeated after another
backend interruption. Each targeted replacement overwrote its previous slot;
we did not select the highest-scoring attempt. These results describe this
operational run and are not a uniform-configuration comparison.

All 255 slots are finished: 89 have scored submissions and 166 have no
submission. Model empty-output failures remain in the submitted results and
count as zero in the primary mean. No residual infrastructure or grading errors
remain. The primary mean RCA F1 is 0.037908627450980385 (3.79%).

## Links

- Agent and benchmark: https://github.com/sands-lab/nika
- Model: https://huggingface.co/farbodtavakkoli/OTel-2.0-LLM-31B-IT
- Submitter: https://github.com/zhihao1998
