---
name: ai-stats-guardrails
description: Configure and debug AI Stats guardrails for API keys. Use when a repository or rollout needs workspace guardrails, model/provider restrictions, budget limits, prompt-injection handling, sensitive-info detection, preview testing, or verification through activity/log views.
---

# AI Stats Guardrails

Use this skill when the work is specifically about configuring or validating gateway guardrails rather than general request wiring.

## Workflow
1. Identify the enforcement goal:
- budget policy
- provider/model restrictions
- prompt-injection handling
- sensitive-info handling

2. Apply guardrails in the right order:
- create or update the workspace guardrail
- attach it to the target API key
- verify the key-level surface reflects the attachment

3. Prefer low-risk rollout defaults:
- start with one key
- use `flag` or `redact` before `block` when false positives are still unknown
- use deterministic sensitive-info rules before higher-latency entity checks

4. Validate before finishing:
- use the preview/test input for guardrails
- confirm request detail dialogs show enforcement metadata
- confirm API key detail surfaces show guardrail activity
- confirm the activity page Guardrail Enforcement panel reflects live traffic

## Practical rules
- Keep provider/model restriction previews in sync with the actual key usage plan.
- Treat custom regex rules as production logic: validate them with one benign and one matching example.
- Add person-name and address detection only when the extra latency is acceptable.
- When debugging an unexpected block, inspect both routing diagnostics and guardrail enforcement details before changing policy.

## Use this skill for
- SDK or app rollouts that need restricted keys
- staged safety rollouts
- debugging blocked or redacted requests
- validating that a guardrail change is visible in activity and request logs
