# VENETA WorldModel, Telco edition

VENETA WorldModel is a governed memory & self-improvement layer placed around the language model. This entry runs the
benchmark's ReAct-style diagnosis loop with that layer and three small harness controls, and nothing else: no skills, no
fine-tuning, no multi-agent orchestration. The controls are a step-budget guard (one reminder to close as the step budget
nears), a one-shot coverage reminder before a no-fault verdict and context compaction (only when the prompt would exceed the
context window, digesting the oldest large tool outputs). Before submission, the fault types the layer recalls for the written
report are appended to it as candidates (type aid).

The model is gemma-4-31b-fp8: the public FP8-Dynamic quantization of Gemma 4 31B IT (RedHatAI/gemma-4-31B-it-FP8-dynamic),
self-hosted on vLLM on one DGX Spark (max-model-len 131072, Gemma 4 reasoning and tool-call parsers, speculative decoding with
the google/gemma-4-31B-it-assistant draft model, 3 tokens). Reasoning effort medium, at most 100 steps per case. Client
settings: the model's reasoning text is sent back on the tool-call turns of the current step; sampling at Google's recommended
values for Gemma 4 (temperature 1.0, top-p 0.95, top-k 64) instead of temperature 0; the context budget is measured with the
server's tokenizer. Every model call went to that local endpoint (verified in the trajectories we hold). Two environment
variables of an unrelated tool were present in the harness process and unused.

## Profile

This is the open-weight profile of the layer: the model is self-hosted on vLLM with the client settings a local model needs
(listed above). The same layer runs in an API-model profile for models reached through a provider's API (our Claude Opus 5.5
entry). The profile changes how the model is reached and driven, not what the layer holds or how it recalls.

## What the layer holds (disclosed in full)

The seed the agent recalls from has 200 active rows:

- 121 rows adapted from the public skills of NIKA's own SADE community agent, and 5 operating-contract rows
  (how to read before concluding, when a healthy verdict is allowed).
- 74 fault-signature rows, one per fault type of the public **dev split**, written from the dev split's trajectories.
  Each names the mechanism and the one reading that reveals it; 10 rows carry an "Outputs:" clause describing what the
  benchmark's own tools print for that mechanism. These rows are dev-derived knowledge and contain no test content, no
  host names, no resource identifiers and no answers. They do name shared lab-template configuration vocabulary that is
  observable with the tools (for example an nft chain name, a P4 table name, the OpenFlow ports 6633 and 6653).
- The seed file also carries 74 archived rows of an earlier draft of the signature text (build history). Archived rows are
  never recalled; the agent saw the 74 active rows only (verified in the run's trajectories, which we hold). The active
  signature text is identified by SHA-256 743b1f4ab883b1e84f986215aa5a25b889f2f155b266051739a03e3f046ed297 over the 74
  active fault-signature texts, sorted, one per line. The signature text recalled in the submitted run hashes to the same
  value on the run's own memory file, so the disclosed seed is the run seed, not a file beside it. The exact command is
  available to the maintainers on request and will be published with our write-up.

During a run, rows are recalled by the task text and again by the evidence the agent gathers. The outcomes of earlier cases
in the same run are written back and recalled for later cases, with trials of the same case excluded (the recall log is checked
by a gate script before packaging); that within-run write-back is the self-improvement step of this entry. Nothing is learned
from the test split before the run: the seed is dev-derived and fixed.

This submission is the scores package only. Trajectories are not included; they will be published with our write-up.

## Exposure check

The scores package carries scores, per-trial metrics and the confusion matrix only: no recalled text, no seed rows and no lab
identifiers. The run's trajectories, which we hold, were scanned before packaging for test-lab identity (IPv4 and MAC
addresses, case hashes, lab identifiers and the ground-truth device names of every test case that carry a digit or underscore;
ten generic device words such as client, controller, web and onos were not checked because they are ordinary vocabulary), and
every recalled outcome of an earlier case was traced to the submitted report of another trial in the same run, never to a
trial of the same case. Result: no finding. The scanner and its planted-violation tests ship with the harness.

## Runs

Single official run (85 cases x 3 trials); the leaderboard's within-run bootstrap interval applies. The run was
pre-registered on the dev-split result of the same stack (dev rca_f1 0.415, measured before the official run). No confirming
run.

## One trial without the memory block (disclosed)

One trial of 255, k8s_lab__healthy__t03, ran without the memory block: during a host incident at 06:31 on 2026-11-04 the
embedding service answered HTTP 500 to that trial's recall call, the harness continued, and the trial is scored as is (1.0; a
healthy case reported healthy). The other 254 trials recalled normally (the same-case exclusion was exercised 76 times). Our
recall-integrity script reports FAIL for this run, and this single infrastructure serving error is its only cause; we disclose
it rather than re-run the slot.

## Links

- Project site: https://veneta.ai
- Code and report: not public at submission time.

## Authors

- VENETA Inc.
