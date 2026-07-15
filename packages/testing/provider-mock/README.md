# `@phaseo/provider-mock`

An in-process, deterministic upstream-provider server for Phaseo gateway tests. It never runs in the Worker and makes no network calls, so it adds no production latency and no provider-token cost.

The mock combines three sources of truth:

1. Vendor OpenAPI operations and request schemas.
2. Small Phaseo overlays for undocumented provider quirks and error shapes.
3. Explicit scenarios for streaming, tools, media, async jobs, rate limits, and malformed responses.

```ts
const mock = await new ProviderMockServer()
  .registerOpenApi("provider-id", providerOpenApi, {
    basePath: "/providers/provider-id",
    strict: true,
  })
  .fault({
    providerId: "provider-id",
    operationId: "createChatCompletion",
    testId: "drops-service-tier",
    response: {
      status: 400,
      body: { error: { message: "unsupported parameter: service_tier", param: "service_tier" } },
    },
  })
  .start();
```

Point only test bindings at `mock.url` (or a provider-specific base path), send a unique `X-Test-Id`, and assert against `mock.getRequests()`. A parameter-adaptation test should assert both attempts: the first contains the rejected field and receives `400`; the second omits it and succeeds.

## Coverage model

Keep a provider manifest beside the tests with one row per enabled provider/capability. CI should fail when an enabled executor has neither an OpenAPI operation nor an explicit overlay. Run a cheap PR matrix for request mapping and response decoding, then run a small nightly live canary set to detect vendor drift. Sanitized canary failures can become deterministic fixtures after review.

OpenAPI cannot describe SSE timing, multi-request async jobs, provider-specific validation text, or every model-level restriction. Those belong in overlays/scenarios, not in production gateway code.

## Provider registry

Each provider contract lives under `contracts/<provider-id>/`:

- `manifest.json` declares provenance and the exact provider operations Phaseo uses.
- `openapi.json` is a gateway-scoped, transitively bundled OpenAPI document.
- `provenance.json` records source and bundle SHA-256 hashes for synchronized vendor artifacts.
- Provider responders in `src/providers/` model SSE, binary bodies, async state, and other behavior OpenAPI cannot express.

OpenAI is the reference implementation. Its source is the official
[`openai/openai-openapi`](https://github.com/openai/openai-openapi) repository. Run:

```sh
pnpm contracts:sync:openai
pnpm test:provider-contracts
```

The OpenAI bundle covers the Phaseo gateway surfaces for Responses, Chat Completions, embeddings, moderation, image generation/editing, speech, transcription, translation, video lifecycle, and batch lifecycle. Organization, administration, fine-tuning, Assistants, and other OpenAI endpoints are deliberately excluded until Phaseo proxies them; upstream changes to those unrelated surfaces should not churn gateway CI.

Anthropic Messages, Google AI Studio `generateContent`, and xAI Responses/Chat Completions are the first documentation-derived overlays. Their manifests label them as `official-docs`, link the exact vendor reference, and explain why they are not represented as vendor-published OpenAPI artifacts. The tool E2E suite passes OpenAI function definitions through the real provider executors, validates each native request shape, and normalizes deterministic `tool_use`, `functionCall`, and `function_call` responses. It runs once for every active catalog model that declares tool support.

Novita is synchronized from its official Mintlify site with `pnpm contracts:sync:novita`. Novita’s LLM pages use Mintlify `api:` sources rather than standalone OpenAPI files, but Mintlify exposes the compiled structured endpoint payload in each page. The sync script extracts those schemas into a reproducible OpenAPI 3.1 bundle covering chat completions, completions, embeddings, rerank, model listing, and model retrieval, with a SHA-256 recorded for every source page. Novita’s separately published per-endpoint OpenAPI JSON files can be synchronized by the same approach as additional gateway capabilities are enabled.

## Cross-provider model matrix

`buildCrossProviderConformanceMatrix()` groups catalog rows by `internal_model_id` and emits one isolated case for every unique provider/model slug. It can select only multi-provider models or include single-provider models as well. The gateway E2E matrix currently covers all 352 active text models across 46 catalog providers and 780 deployments; 125 of those models span multiple providers, accounting for 550 deployments. Every deployment gets a baseline generation; deployments declaring tools, structured output, or sampling limits receive additional capability-specific cases. The matrix is generated from catalog data, so new providers and model deployments enter CI automatically rather than relying on a manually maintained allowlist.
