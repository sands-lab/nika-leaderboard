# ReAct + GLM-4.7-Flash

NIKA Team evaluated the LangGraph ReAct harness (`byo.langgraph`) with
GLM-4.7-Flash on NIKA benchmark 0.2.0, test split.

## Evaluation

The run covers 85 tasks with three trials each. All 255 trials finished:
231 successful runs and 24 agent failures. Failed trials count as zero in
primary means. The run has no remaining infrastructure or grading errors.
Mean RCA F1 is 8.46%, localization F1 is 21.08%, and detection score is 74.12%.

The harness uses the standard NIKA MCP tools, a 100-step limit, 32768 maximum
output tokens, a 14400-second agent timeout and a 15000-second task timeout.
Run ID: `c6917f63cb8b1e5b`. All trials record NIKA commit
`663784e8bea88499b157008299e9957c61905f48`.

## Model and reference pricing

The checkpoint is [zai-org/GLM-4.7-Flash](https://huggingface.co/zai-org/GLM-4.7-Flash).
This run records a self-hosted endpoint; its metadata does not record the model
revision or serving precision.

Model weights release date: 2026-01-19, from the
[first weight upload](https://huggingface.co/zai-org/GLM-4.7-Flash/commit/75fce703a93da3705c4cf8d3caadbac1d1072c78).
The reviewed leaderboard catalog supplies the OpenRouter reference quote:
USD 0.0605 per million input tokens and USD 0.40 per million output tokens,
retrieved 2026-10-14 from the [model page](https://openrouter.ai/z-ai/glm-4.7-flash)
and [public model API](https://openrouter.ai/api/v1/models).
This estimates hosted token cost; the self-hosted GPU bill is not recorded.

[Trajectories](https://huggingface.co/datasets/Zhihao98/nika-trajectories/tree/main/trajectories/0.2.0/20261015_react_glm_4_7_flash)
