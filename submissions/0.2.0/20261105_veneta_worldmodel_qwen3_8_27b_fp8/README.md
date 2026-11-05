# VENETA WorldModel, Telco edition

VENETA WorldModel is a governed memory & self-improvement layer placed around the language model. This entry runs the
benchmark's ReAct-style diagnosis loop with that layer and four small harness controls, and nothing else: no skills, no
fine-tuning, no multi-agent orchestration. The controls are a step-budget guard (one reminder to close as the step budget
nears), a one-shot coverage reminder before a no-fault verdict, context compaction (only when the prompt would exceed the
context window, digesting the oldest large tool outputs), and one evidence-review step before the final verdict. Before
submission, the fault types the layer recalls for the written report are appended to it as candidates (type aid).

The model is qwen3.8-27b-fp8, self-hosted on vLLM (max-model-len 131072, context budget 120000 tokens measured with the
server's tokenizer). Reasoning effort medium, at most 100 steps per case.

## Profile

This is the open-weight profile of the layer: the model is self-hosted on vLLM with the client settings a local model
needs (the served model pinned, the context budget measured with the server's tokenizer). The same layer runs in an
API-model profile for models reached through a provider's API (our Claude Opus 5.5 entry). The profile changes how the
model is reached and driven, not what the layer holds or how it recalls.

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

Single official run (85 cases x 3 trials). 248 of 255 trials produced a submission; 7 trials ended without one (the agent
did not emit a final submission) and count as 0 in the primary mean, as the leaderboard specifies. The leaderboard's
within-run bootstrap interval applies. The run was pre-registered on the dev-split result of the same stack (dev rca_f1
0.643, measured before the official run). No confirming run; run #1 is submitted as pre-registered.

## Links

- Project site: https://veneta.ai
- Code and report: not public at submission time.

## Authors

- VENETA Inc.
