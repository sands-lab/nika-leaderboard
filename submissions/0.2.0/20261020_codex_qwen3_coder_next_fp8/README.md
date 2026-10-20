# Codex + Qwen3-Coder-Next

Authors: NIKA Team

This entry runs the Codex CLI through NIKA's `cli.codex` agent (Codex in a
Docker Sandbox) with the standard NIKA MCP tools. The model is
`Qwen/Qwen3-Coder-Next-FP8`, self-hosted with vLLM 0.24 behind an
OpenAI-compatible endpoint.

## Evaluation

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- All 255 slots finished: 254 scored submissions and 1 agent failure without a
  submission, which counts as zero in primary means. In the failed trial
  (`enterprise_branch__bgp_hijac__h93dd2b8e7404__t02`) the Codex diagnosis phase
  stalled for 300 seconds without progress and the agent stopped before
  submitting.
- Mean RCA F1: 0.1457337255 (14.57%).
- Mean localization F1: 0.2914121569 (29.14%).
- Mean detection score: 0.8078431373 (80.78%).
- Budgets: 100 steps, 1800-second agent timeout and 2400-second task timeout.
  No output-token limit was set: the run records `max_tokens: null`, and NIKA
  does not apply its output-token cap to Codex agents.
- No residual infrastructure or grading errors.

## Run provenance

- NIKA commit: the run identity records `98ce4879a23914b15cd55a066c0a105f7946a4b3`
  (clean tree). 246 trials ran at commit `77e25143` and 9 at `98ce4879`, both on
  the branch of [sands-lab/nika#213](https://github.com/sands-lab/nika/pull/213),
  which is not merged; the later commit changes only host-side Firecracker
  scheduling and error handling. The run history also records one resume at
  commit `77e25143` with uncommitted changes in the NIKA tree (2026-10-20 04:19
  UTC); the changes themselves are not recorded.
- Agent configuration: NIKA's default shared troubleshooting skills were enabled
  (`agent.enable_skills` default); no other harness optimization was used.
- Execution: NIKA's opt-in Firecracker execution mode with case images
  (`nika.execution: firecracker`, `nika.firecracker.case_images: true`, from
  #213). Each task's failure was injected once into a restored lab image and
  saved as a case image; all three trials of a task restored that injected state,
  and the agent started after a fault-presence check. The agent and its sandbox
  ran on the host.
- Reruns: nine trials that ended `endpoint_failed` (the model endpoint briefly
  had no healthy backend) or `infra_failed` (the Codex process exited at start)
  were rerun once.
- Model serving: vLLM 0.24, Hugging Face revision
  `da6e2ed27304dd39abadd9c82ef50e8de67bdd4c`, FP8 weights, 262144-token context
  window, tensor parallelism over A100 GPUs (two replicas behind a load
  balancer).

The leaderboard estimates cost from public reference rates for hosted
inference; it is not the self-hosted GPU cost of this run.

## Links

- [Agent code](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA
  rather than this agent.
- [Model page](https://huggingface.co/Qwen/Qwen3-Coder-Next-FP8)
- [Trajectories](https://huggingface.co/datasets/nika-bench/nika-trajectories/tree/main/trajectories/0.2.0/20261020_codex_qwen3_coder_next_fp8)
