---
name: phaseo-response-healing
description: Configure and debug Phaseo response healing for structured JSON workflows. Use when a repository needs preset or workspace plugin defaults, request-level plugin overrides, malformed JSON recovery, or log-based verification of healing behavior.
---

# Phaseo Response Healing

Use this skill when the problem is specifically about structured-output recovery rather than general gateway wiring.

## Workflow
1. Confirm the caller already wants structured JSON:
- `response_format`
- JSON schema style output
- one stable object contract

2. Enable `response-healing` at the right layer:
- workspace default plugin policy for broad enforcement
- workspace default plugin policy with override locking when one JSON policy must be enforced everywhere
- preset plugin config for one workflow
- request-level plugin config for isolated debugging
- choose `safe` when bounded syntactic repair is acceptable
- choose `strict` when the workflow should only unwrap already-valid JSON from fences or surrounding text

3. Keep rollout deterministic:
- use response healing for non-streaming structured requests
- use stable prompts and lower temperature where possible
- do not rely on healing to invent missing business fields

4. Validate in logs before finishing:
- plugin execution should appear in request detail metadata
- confirm whether healing was attempted
- confirm whether the payload changed
- inspect failure reasons for unrecoverable responses

## Practical rules
- Treat healing as a structural repair path, not a semantic correctness system.
- Expect healed JSON Schema outputs to be validated against common constraints such as required keys, scalar types, array bounds, `uniqueItems`, numeric bounds, regex, and common string formats like `email`, `uri`, `uuid`, and `date-time`.
- Expect streaming requests to skip response healing entirely.
- If the model returns prose instead of JSON, fix prompting or response format first.
- If outputs are truncated, inspect token limits before blaming the plugin.
- Prefer preset defaults for repeated structured workflows so callers do not drift into inconsistent plugin usage.
- Use locked workspace defaults when one team-wide structured-output policy must not be bypassed by presets or request payloads.

## Use this skill for
- structured-output integrations with occasional malformed JSON
- preset rollouts that need plugin defaults
- workspace policy setup for JSON-heavy product surfaces
- debugging why healing did or did not run for a given request
