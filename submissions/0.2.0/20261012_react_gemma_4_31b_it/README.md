# ReAct + Gemma-4-31B-it

Authors: NIKA Team

This entry uses the ReAct agent implemented with LangGraph through NIKA's `byo.langgraph` integration, self-hosted Gemma-4-31B-it, and the standard NIKA MCP tools.

## Evaluation

- All 255 trials finished with scored submissions.
- Mean RCA F1: 0.22604588235294118 (22.60%).
- Mean localization F1: 0.37185843137254904 (37.19%).
- Mean detection score: 0.8745098039215686 (87.45%).

- Benchmark release: nika-bench 0.2.0, test split, 85 tasks with 3 trials each.
- Recorded budgets: 100 steps, 32768 maximum output tokens, 14400-second agent timeout and 15000-second task timeout.
- NIKA commits: 240 trials ran at `8f04c8422623f9f785fa391d7e2ead62f4bfab9c` and 15 at `e9656af3aa15e3db1168328656065d11e19d4b85`, both from clean worktrees.

## Links and model information

- [Agent and benchmark](https://github.com/sands-lab/nika)
- [Project site](https://sands-lab.github.io/nika/)
- [Benchmark paper](https://arxiv.org/abs/2512.16381), which describes NIKA.
- [Model checkpoint](https://huggingface.co/google/gemma-4-31B-it)
- [Trajectories](https://huggingface.co/datasets/Zhihao98/nika-trajectories/tree/main/trajectories/0.2.0/20261012_react_gemma_4_31b_it)

This submission reuses the leaderboard's reviewed `gemma-4-31B-it` catalog entries: release date 2026-04-02, sourced from the [Google announcement](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/), and the [OpenRouter reference quote](https://openrouter.ai/google/gemma-4-31b-it) retrieved on 2026-10-12 (USD 0.09 per million input tokens and USD 0.34 per million output tokens). The hosted quote estimates token costs; it does not measure this run's GPU bill. The run metadata does not record the evaluated model revision or serving precision.

## Release provenance

NIKA PR #178 changed five test tasks (15 trial slots) after this run started. Enterprise BGP hijacking, Kubernetes incorrect netmask, and P4 pending-connection update race were repaired; MAC address conflict moved from P4 to the campus LAN; and P4 connection-state exhaustion was held out, with a P4 table-resource exhaustion task taking its slots. We deleted the 15 trials of the old tasks and ran the 15 replacement slots at `e9656af3aa15e3db1168328656065d11e19d4b85` in the same result directory, with the same model, agent, and budgets. The package matches the current 0.2.0 test manifest.
