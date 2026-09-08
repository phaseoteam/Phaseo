---
"@phaseo/gateway-api": patch
---

Recover expired Video and Batch webhook claims, validate current delivery state without cached reads, and transactionally queue Batch lifecycle events. Protect delivery results with claim ownership and preserve the initial attempt plus three recorded retries. Reject native media overrides in video provider options and correctly route Fal frame and reference inputs.
