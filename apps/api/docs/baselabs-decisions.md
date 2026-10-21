# Base Labs decision models

Elephant-1 (9B) and Mammoth-1 (27B) use the existing Decisions IR and
`POST /v1/decisions` contract. The Baseten executor sends typed questions to
`https://inference.baseten.co/v1/systemone` and preserves probabilities,
confidence, fractional scores, canonical model identity, and actual token usage.

Canonical models are `baselabs/elephant-1` and `baselabs/mammoth-1`. Their
upstream IDs are `decision-models/baseten-elephant-9b-latest` and
`decision-models/baseten-mammoth-27b-latest`; these are provider-managed aliases.
Text and JSON evidence, predicates, 1–255 choices, and 2–10 score levels are
supported. Media and Box are not enabled. The training sequence length in the
technical report is not treated as an API context limit.

The catalogue lives in Supabase. Routes must remain disabled until this
executor is deployed. The launch promotion is free through October 27, 2026
at 11:59 PM Pacific (`2026-10-28T06:59:00Z`). No post-promotion price has been
published; the free SKU must expire rather than become an indefinite zero rate.

Official sources, checked October 21, 2026:

- https://www.baseten.co/library/elephant-1/
- https://www.baseten.co/library/mammoth-1/
- https://labs.baseten.co/articles/mammoth-1-and-elephant-1-frontier-decision-models
- https://huggingface.co/baselabs/elephant-1
- https://huggingface.co/baselabs/mammoth-1
- https://x.com/baseten/status/2112955524207825053

Both models returned HTTP 200 from direct upstream probes. Elephant-1 was
tested with predicate, choice, and score questions; Mammoth-1 with choice.
Bearer authentication was also verified. These probes do not establish
deployed Phaseo gateway support.

The Base Labs wordmark is the official inline SVG from https://labs.baseten.co/.
The light asset is copied unchanged; the dark asset changes only black fill
to white. Both are registered under the lab's `baselabs` identity.
