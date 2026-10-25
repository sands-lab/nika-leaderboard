# Ornith-1.5-122B with Claude Code

This submission evaluates Ornith-1.5-122B through the Claude Code harness on the
NIKA 0.2.0 test split: 85 network troubleshooting tasks, with three trials per task.

## Configuration

- **Model:** `ornith-ai/Ornith-1.5-122B`, revision
  `7681ef608624e7532d8164128bcffdbdbaf1b1af`.
- **Serving:** self-hosted vLLM 0.24, original BF16 weights, tensor parallelism
  across two H200 GPUs per server, and a 262,144-token context window.
- **Harness:** Claude Code through NIKA's custom-provider integration. A local
  LiteLLM proxy forwards native Anthropic-format requests to vLLM; the benchmark
  does not use an Anthropic-hosted model.
- **Limits:** 100 maximum steps, 8,192 maximum output tokens per request,
  1,800-second agent timeout, and 2,400-second task timeout.
- **Concurrency:** batch size 16 and heavy-task batch size 1.
- **NIKA revision:** `ce0d0ba598ba1a6a09b712f8b52bab6a54c0806d`.

## Execution and recovery

The run spans multiple ORIX allocations. NIKA's resume mechanism retained scored
trials and retried infrastructure interruptions. Scored agent failures are included;
they were not removed or rerun to improve the score. The final recovery targets
only the two trials left unfinished after the earlier allocations ended.

During part of the run, multiple inference backends served the same model revision
and configuration through LiteLLM. Separate trajectory-audit workloads and LangGraph
benchmark runs also shared the inference service during parts of the run, including
a separate batch-4 LangGraph experiment. These conditions can affect latency;
this is not a controlled inference-throughput measurement. Audit analyses are not
benchmark scores and were not provided to the troubleshooting agents.

## Pricing

This run used self-hosted vLLM on ORIX GPUs. No verified, currently available public
per-token price was established for this model. Token pricing is unavailable, not
zero, and does not represent the compute cost of this run.
