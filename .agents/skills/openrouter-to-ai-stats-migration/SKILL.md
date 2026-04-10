---
name: openrouter-to-ai-stats-migration
description: End-to-end migration guide for moving an existing OpenRouter integration to AI Stats Gateway. Use when repositories contain openrouter.ai endpoints, sk-or-v1 keys, OPENROUTER_API_KEY env vars, provider-prefixed model IDs, or OpenRouter-specific headers and the user wants a full migration with implementation, validation, and safe rollout.
---

# OpenRouter to AI Stats Migration

Use this skill to complete a full migration from OpenRouter to AI Stats Gateway with minimal risk.

## Outcome
Deliver a working integration that:
- sends traffic to AI Stats (`https://api.phaseo.app/v1`)
- authenticates with `AI_STATS_API_KEY`
- uses valid model IDs discovered from `/v1/models`
- preserves expected response shape for callers
- passes smoke tests for both non-streaming and streaming paths

## Workflow
1. Inventory all OpenRouter usage.
2. Replace endpoint and credentials.
3. Normalize model IDs.
4. Handle OpenRouter-only behaviors.
5. Validate and produce migration report.

## 1) Inventory OpenRouter Usage
- Search for:
  - `openrouter.ai`
  - `OPENROUTER_API_KEY`
  - `sk-or-v1`
  - `HTTP-Referer` and `X-Title`
  - provider-prefixed model IDs (for example `openai/gpt-4o`)
- Classify each usage surface:
  - raw REST/fetch/axios
  - OpenAI SDK clients (TypeScript/Python)
  - Vercel AI SDK/OpenRouter provider usage
  - environment/config files, CI secrets, deployment settings

## 2) Replace Endpoint and Credentials
- Replace OpenRouter base URL with:
  - `https://api.phaseo.app/v1`
- Replace key source with:
  - `AI_STATS_API_KEY`
- Keep auth format:
  - `Authorization: Bearer <key>`
- Keep attribution headers when available:
  - `x-title`
  - `http-referer`

### Canonical before/after
```ts
// Before
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// After
const client = new OpenAI({
  apiKey: process.env.AI_STATS_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});
```

## 3) Normalize Model IDs
- Do not assume OpenRouter model IDs work unchanged.
- Query `GET /v1/models` and select supported IDs.
- Build a temporary compatibility map when needed (example: translate `provider/model` aliases to AI Stats IDs).
- Apply mapping at a single boundary function to minimize diff and simplify rollback.

Use [references/openrouter-migration-playbook.md](references/openrouter-migration-playbook.md) for an implementation template.

## 4) Handle OpenRouter-only Behaviors
- If code depends on provider routing/preferences, remove or re-implement with AI Stats-supported controls.
- If code depends on OpenRouter-specific fields in responses, adapt at a compatibility layer instead of rewriting all callers.
- Preserve streaming behavior and message format expected by the app.

## 5) Validate and Report
Run this validation sequence:
1. `GET /v1/health`
2. `GET /v1/models`
3. one non-streaming generation request
4. one streaming generation request
5. one failure-path check (invalid key or invalid model) to confirm error handling

Migration is complete only when:
- no runtime code paths still point to `openrouter.ai`
- OpenRouter env keys are removed or deprecated safely
- all target environments use `AI_STATS_API_KEY`
- smoke tests pass in local/dev (and staging if available)

## Deliverables
Always include:
- list of changed files
- env var and secret updates (old -> new)
- model mapping decisions (old -> new)
- test evidence and any unresolved parity gaps
- rollback note (single config switch or patch plan)

## Guardrails
- Keep changes minimal and reversible.
- Do not commit API keys or secret values.
- Prefer boundary adapters over broad refactors.
- If a feature cannot be matched exactly, call out behavior deltas explicitly.
