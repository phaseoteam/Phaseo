---
name: phaseo-routing-presets
description: "Rolls out and debugs Phaseo presets and routing policy: choosing between a fixed model ID, a preset (`@slug`) or a router such as `phaseo/free`, provider narrowing and fallbacks, stable request shapes for prompt caching, and request-log investigation. Use when requests should share defaults, routing picks an unexpected provider, fallbacks misbehave, or someone expects a preset's response caching to work (it is not available yet). Not for choosing which model to use (use phaseo-model-selection) or key restrictions and budgets (phaseo-guardrails)."
license: MIT
---

# Phaseo Routing and Presets

Use this skill when one repository should stop scattering routing defaults across callers and instead move to stable preset-driven configuration.

## Response caching is not available yet

A preset accepts `response_caching.enabled` and `response_caching.ttl_seconds`, but the Gateway does not store or replay responses today. Every request goes to a provider and is billed normally, and request details show no response-cache hit or miss. Do not promise cache hits, raise TTLs or debug "cache misses". To cut the cost of repeated prompts, use [prompt caching](https://phaseo.app/docs/v1/guides/prompt-caching), which needs the same stable request shapes. If repeated identical requests must not reach a provider, cache in the application. See [Use response caching with presets](https://phaseo.app/docs/v1/cookbook/response-caching-with-presets).

## Outcome
Deliver a working integration or rollout that:
- uses presets instead of repeating system prompts, routing preferences, or parameter defaults inline
- keeps request shapes stable so provider prompt caching keeps hitting
- gives operators one clear path to inspect routing outcomes in request details

## Workflow
1. Identify whether the caller should use a fixed model id, a preset slug, or a virtual alias such as `phaseo/free`.
2. If prompt, provider, reasoning, or parameter defaults should stay shared across callers, move them into a preset instead of repeating them in every request body.
3. Keep request overrides minimal once a preset exists. Prefer `preset` plus request-specific input over large ad-hoc request payloads.
4. Keep the request prefix stable so prompt caching works:
- avoid unnecessary system-prompt drift
- avoid volatile tool lists
- avoid per-request provider overrides unless they are essential
5. When routing looks wrong, debug from request detail views before changing config:
- providers considered
- ranked candidates and routing factors
- prompt-cache read and write tokens
- workspace-policy or guardrail blocks
6. If multiple workloads need different routing or prompt defaults, split them into different presets instead of one overloaded preset.

## Rules

- Prefer preset-driven routing over hard-coded `model: "@slug"` strings scattered across many files.
- Keep preset slugs stable and descriptive.
- Use one preset per operational policy boundary, not one preset per tiny caller variation.
- Do not tell anyone a preset's `response_caching` setting saves money or latency; it has no effect today.
- Debug routing changes from logs and request detail surfaces before changing provider weights or restrictions again.

## Validation

- one deterministic request path or unit/integration test using the intended preset or routing config
- one check that the final request surface still exposes the expected routing diagnostics
- one docs or example path aligned with the shipped preset workflow when the repository-facing workflow changed
