---
name: openrouter-to-phaseo-migration
description: "Migrates an existing OpenRouter integration to the Phaseo Gateway end to end: usage inventory, endpoint, key and SDK swap, model ID and suffix mapping, provider objects, plugins, presets and OpenRouter-only fields, validation and a migration report. Use when code contains openrouter.ai URLs, sk-or-v1 keys, OPENROUTER_API_KEY, @openrouter packages or OpenRouter provider objects and the user wants a full migration. Not for other source platforms (use phaseo-migration) or new Phaseo integrations (phaseo-gateway)."
license: MIT
---

# OpenRouter to Phaseo Migration

Use this skill to complete a full migration from OpenRouter to Phaseo Gateway with minimal risk. Phaseo speaks the same OpenAI-compatible API and reads most OpenRouter request fields unchanged, so most of the work is model IDs and a short list of fields that Phaseo rejects.

## Outcome
Deliver a working integration that:
- sends traffic to Phaseo (`https://api.phaseo.app/v1`)
- authenticates with `PHASEO_API_KEY`
- uses model IDs confirmed by `GET /v1/models?format=openai`
- sends no field that Phaseo rejects (see the playbook's "Fails on Phaseo" table)
- preserves the response shape callers expect
- passes smoke tests for both non-streaming and streaming paths

## Workflow
1. Inventory all OpenRouter usage.
2. Replace endpoint, credentials and SDK.
3. Map model IDs and suffixes.
4. Map request fields, plugins and presets.
5. Validate and produce a migration report.

Use [references/openrouter-migration-playbook.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/openrouter-to-phaseo-migration/references/openrouter-migration-playbook.md) for the full mapping tables, the mapping boundary template and the validation commands.

## 1) Inventory OpenRouter Usage
- Search for:
  - `openrouter.ai`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `sk-or-v1`
  - `HTTP-Referer`, `X-Title` and `X-OpenRouter-*` headers
  - `@openrouter/ai-sdk-provider`, `@openrouter/sdk`, `openrouter` (PyPI)
  - model IDs with an `org/` prefix, a `:` suffix (`:free`, `:nitro`, `:floor`, `:online`), a `~` prefix, or the `openrouter/` routers
  - `provider:` objects, `models:` arrays, `plugins`, `transforms`, `usage: { include`, `@preset/`
  - calls to `/api/v1/generation`, `/api/v1/credits`, `/api/v1/key`
- Classify each usage surface:
  - raw REST/fetch/axios
  - OpenAI SDK clients (TypeScript/Python)
  - Vercel AI SDK with the OpenRouter provider
  - OpenRouter's own SDKs
  - environment/config files, CI secrets, deployment settings

## 2) Replace Endpoint, Credentials and SDK
- Replace the OpenRouter base URL with `https://api.phaseo.app/v1`.
- Replace the key source with `PHASEO_API_KEY`. Auth stays `Authorization: Bearer <key>`.
- Keep `HTTP-Referer` and `X-Title`. Rename `X-OpenRouter-Title` to `X-Title` and `X-OpenRouter-Categories` to `X-App-Categories`; Phaseo ignores the `X-OpenRouter-*` names. Add `X-App-Id` for stable app grouping.

### Canonical before/after
```ts
// Before
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// After
const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});
```

### SDK swaps
- `@openrouter/ai-sdk-provider`: use `@phaseo/ai-sdk-provider`. `createOpenRouter` becomes `createPhaseo`, `openrouter.chat(id)` becomes `phaseo(id)` (there is no `.chat()`), and `providerOptions.openrouter` or `extraBody` become `providerOptions.phaseo`, which is merged into the request body. Match the installed `ai` major: the default tag for AI SDK 7, `@ai-sdk-v6` or `@ai-sdk-v5` otherwise.
- `@openrouter/sdk` and Python `openrouter` use their own call shapes, so changing the base URL is not enough. Move those calls to the OpenAI SDK above, `@phaseo/sdk` or Python `phaseo`.

## 3) Map Model IDs and Suffixes
- IDs share the `<org>/<model>` shape and most carry over, but not all. Known org differences: `x-ai/` is `spacex-ai/`, `meta-llama/` is `meta/`, `mistralai/` is `mistral/`. Version spelling can differ too.
- Check every production ID against `data[].id` from `GET /v1/models?format=openai`. Without `format=openai` the response is Phaseo's paged `models` list, which has no `data` array.
- Suffixes: Phaseo strips `:nitro` (throughput), `:cheap` and `:fast`. Map `:floor` to `:cheap`. Remove `:online` and add web search (step 4). Remove `:thinking` and set `reasoning`. Any other suffix stays in the ID and the lookup fails.
- Routers: `openrouter/auto` becomes `phaseo/auto` (alpha; workspaces without access get 400 `auto_routing_feature_flag_disabled`). `openrouter/free` becomes `phaseo/free`. `~org/model-latest` aliases have no equivalent; pin a current ID.
- Apply every translation in a single boundary function, so call sites keep their names and rollback stays simple. Do not guess replacement IDs.

## 4) Map Request Fields, Plugins and Presets
- Keep `provider` objects. `order`, `only`, `ignore`, `sort`, `allow_fallbacks`, `require_parameters`, `zdr`, `quantizations`, `max_price`, `preferred_min_throughput` and `preferred_max_latency` work unchanged. Remove `data_collection: "deny"` and `enforce_distillable_text: true` (400 `unsupported_routing_filter`); use `zdr: true` instead. Use base provider IDs, not endpoint slugs such as `deepinfra/turbo`.
- `models` fallbacks work (1 to 25), but `model` is required: move `models[0]` into `model`. They cannot be combined with `phaseo/auto`.
- Plugins: `web`, `web-fetch` and `response-healing` (non-streaming only) exist. `file-parser`, `context-compression` and `auto-router` return 400 `unknown_gateway_plugin`, even with `enabled: false`. Rename `openrouter:web_search` tools to `phaseo:web_search`.
- Remove `transforms`, the `preset` body field and `usage: { include: true }` (usage and cost are always returned, and an object `usage` is a 400). `reasoning.exclude` is ignored, so reasoning is still returned.
- Presets: `@preset/<slug>` becomes `@<slug>`, created in Phaseo first. `model@preset/<slug>` has no equivalent.
- Response fields: `usage.cost`, `usage.cost_details.upstream_inference_cost`, `message.reasoning`, `reasoning_details` and `provider` are returned. Normalize only what callers read and Phaseo lacks (`native_finish_reason`, `is_byok`, split upstream costs) in one compatibility layer.

## 5) Validate and Report
Run this validation sequence:
1. `GET /v1/health`
2. `GET /v1/models?format=openai`, checking every mapped ID
3. one non-streaming request with `phaseo/free` (works without a wallet balance)
4. one streaming request with `phaseo/free`
5. one failure-path check (invalid model) to confirm error handling
6. one real request per mapped production model, plus tools and structured output where the app uses them

Migration is complete only when:
- no runtime code paths still point to `openrouter.ai`
- OpenRouter env keys are removed or deprecated safely
- all target environments use `PHASEO_API_KEY`
- no request sends a field from the playbook's "Fails on Phaseo" table
- smoke tests pass in local/dev (and staging if available)

## Deliverables
Always include:
- list of changed files
- env var and secret updates (old -> new)
- model mapping decisions (old -> new), including suffixes and routers
- request fields removed or rewritten
- test evidence and any unresolved parity gaps
- rollback note (single config switch or patch plan)

## Guardrails
- Keep changes minimal and reversible.
- Do not commit API keys or secret values. If an `sk-or-v1` key was ever committed, tell the user to rotate it.
- Prefer boundary adapters over broad refactors.
- If a feature cannot be matched exactly, call out behavior deltas explicitly.
