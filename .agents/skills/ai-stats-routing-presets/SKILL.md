---
name: ai-stats-routing-presets
description: Roll out and debug AI Stats presets, routing policy, and response caching. Use when repositories need preset-driven request defaults, stable cache behavior, provider narrowing, or request-log investigation for routing outcomes and cache misses.
---

# AI Stats Routing, Presets, and Caching

Use this skill when one repository should stop scattering routing defaults across callers and instead move to stable preset-driven configuration.

## Outcome
Deliver a working integration or rollout that:
- uses presets instead of repeating system prompts, routing preferences, or parameter defaults inline
- keeps request shapes deterministic when response caching is expected to work
- gives operators one clear path to inspect routing outcomes and cache hit or miss behavior in request details

## Workflow
1. Identify whether the caller should use a fixed model id, a preset slug, or a virtual alias such as `ai-stats/free`.
2. If prompt, provider, reasoning, or parameter defaults should stay shared across callers, move them into a preset instead of repeating them in every request body.
3. Keep request overrides minimal once a preset exists. Prefer `preset` plus request-specific input over large ad-hoc request payloads.
4. If response caching matters, keep the request fingerprint stable:
- avoid unnecessary system-prompt drift
- avoid volatile tool lists
- avoid per-request provider overrides unless they are essential
5. When routing or caching looks wrong, debug from request detail views before changing config:
- providers considered
- ranked candidates and routing factors
- response-cache hit or miss diagnostics
- workspace-policy or guardrail blocks
6. If multiple workloads need different routing or cache behavior, split them into different presets instead of one overloaded preset.

## Rules

- Prefer preset-driven routing over hard-coded `model: "@slug"` strings scattered across many files.
- Keep preset slugs stable and descriptive.
- Use one preset per operational policy boundary, not one preset per tiny caller variation.
- If response caching is enabled, treat prompt shape, response format, tool list, and provider options as part of the cache contract.
- Debug cache misses by comparing the real fingerprint inputs, not by increasing TTL first.
- Debug routing changes from logs and request detail surfaces before changing provider weights or restrictions again.

## Validation

- one deterministic request path or unit/integration test using the intended preset or routing config
- one check that the final request surface still exposes the expected routing or cache diagnostics
- one docs or example path aligned with the shipped preset/caching workflow when the repository-facing workflow changed
