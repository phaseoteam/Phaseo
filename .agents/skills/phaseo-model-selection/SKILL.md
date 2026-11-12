---
name: phaseo-model-selection
description: Chooses, compares and pins Phaseo model IDs for a workload by modality, context window, token price, capabilities (tools, structured output, reasoning, vision), provider availability, data policy and lifecycle, using GET /v1/models or the Phaseo MCP. Use when someone asks which model to use, the cheapest or best model for a task, whether a model supports a feature, what a workload will cost, or what replaces a deprecated model or alias. Not for wiring requests (phaseo-gateway), routing or fallback policy (phaseo-routing-presets), or tracking spend (phaseo-usage-monitoring).
license: MIT
---

# Phaseo Model Selection

Pick a model ID from live Phaseo data, not memory. The catalogue changes often, so every ID, price, context window and capability you report must come from `GET /v1/models` or the Phaseo MCP in this session.

## Get current data

| Need | REST (`https://api.phaseo.app`, `Authorization: Bearer $PHASEO_API_KEY`) | Phaseo MCP, when connected |
| --- | --- | --- |
| Search and filter models | `GET /v1/models` | `phaseo:models_list` |
| One model's details | `GET /v1/models?search=<model-id>` | `phaseo:model_get` |
| Per-provider routes, parameters and prices | `GET /v1/models/{author}/{slug}/endpoints` | `providerSupport` in `phaseo:model_get` |
| Providers | `GET /v1/providers` | `phaseo:providers_list` |
| Endpoint IDs for a modality | `GET /v1/endpoints` | none |
| Benchmark rankings | none in the Gateway API; use model pages | `phaseo:benchmark_rankings` |
| Cost of a token workload | `POST /v1/pricing/calculate`, or the meter maths below | `phaseo:cost_estimate` |
| Deprecation and replacement | `lifecycle` on each model | none; use REST |

Filters, response fields and examples: [references/catalogue-api.md](references/catalogue-api.md). MCP parameters, scopes and outputs: [references/mcp-tools.md](references/mcp-tools.md). If neither the MCP nor an API key is available, search the `phaseo-docs` MCP and say the data could not be checked live.

## Workflow

Copy this checklist and tick it off:

```text
- [ ] 1. Workload written down: modality, endpoint, context, capabilities, budget, data policy
- [ ] 2. Candidates listed from live data, with filters stated
- [ ] 3. Quality evidence from a named benchmark, or marked "no benchmark evidence"
- [ ] 4. Each candidate's lifecycle, offers and required parameters confirmed
- [ ] 5. Cost estimated per offer, with assumptions
- [ ] 6. Pinned ID chosen and validated on its endpoint
```

1. **Pin down the workload.** Ask only for what is missing: input and output modality, the endpoint the app calls, typical and maximum input tokens, expected output tokens, required parameters, monthly volume, budget, and any ZDR, region or BYOK requirement.
2. **Map the modality to an endpoint.** Get the endpoint ID from `GET /v1/endpoints` (`data[].public_path`), then filter `GET /v1/models?endpoints=<endpoint-id>`.

   | Workload | Public path |
   | --- | --- |
   | Text, chat, agents | `/v1/responses`, `/v1/chat/completions`, `/v1/messages` |
   | Image generation and editing | `/v1/images/generations`, `/v1/images/edits` |
   | Video (preview access) | `/v1/videos`; list models with `GET /v1/videos/models` |
   | Embeddings | `/v1/embeddings` |
   | Rerank | `/v1/rerank` |
   | Moderation | `/v1/moderations` |
   | Speech (text to speech) | `/v1/audio/speech` |
   | Transcription and spoken translation | `/v1/audio/transcriptions`, `/v1/audio/translations` |
   | Music | `/v1/music/generate` |
   | Documents | `/v1/ocr`, `/v1/parse` |

3. **Shortlist.** Combine filters: `input_modalities` and `output_modalities`, `minimum_context_tokens`, `maximum_input_price_per_million`, `supported_parameters`, `provider`, `organisation`, `status=active`, `sort_by=input_price`. Filters narrow the list; they do not prove a model fits. Do not assume several `supported_parameters` values are all required at once.
4. **Check capabilities on the model and the offer.**
   - Vision: `image` in `modalities.input`.
   - Tools: `tools` (and `tool_choice` if forced) in `capabilities.parameters`.
   - Structured output: `structured_outputs`, `response_format` or `json_schema`.
   - Reasoning: `reasoning`, `reasoning_effort` or `include_reasoning`.
   - Context: `limits.input_tokens`; output cap: `limits.output_tokens`.

   A model-level parameter can come from one provider only. Confirm it on the offer you expect to serve the request (`offers[].capabilities.parameters`, or the `/endpoints` route).
5. **Add quality evidence separately.** Rankings come from benchmarks; availability and price are separate facts. Use `phaseo:benchmark_rankings` (`focus`: `general`, `coding`, `agentic`) and name the benchmark and its source. Never infer quality from price, provider count or Gateway availability, and never reorder a ranking because a model is routable. `focus: "cost_efficiency"` is benchmark evaluation cost, not token price. With no benchmark data, say so.
6. **Check data policy.**
   - ZDR: `/v1/models` has no ZDR field. Check the provider cards on the model page, then enforce it per request with `provider.require_zero_data_retention: true` or as a workspace default in **Settings -> Privacy**. The candidate pool can shrink to nothing.
   - Region: call `/v1/models` on the host the app will use (`https://eu.api.phaseo.app/v1/models` or `https://us.api.phaseo.app/v1/models`). Offers carry `residency.execution_regions` and `residency.data_regions`. Regional hosts are text-only and are not an end-to-end residency guarantee.
   - BYOK: the provider bills the usage under its own quotas, data policy and model access. Catalogue prices are provider-equivalent estimates; see the BYOK section of the routing guide for the Phaseo fee.
7. **Check lifecycle** (see below), then **estimate cost** (see below).
8. **Pin and validate.** Recommend one model ID plus one alternative. Confirm the route: `GET /v1/models/{author}/{slug}/endpoints` must show a row for the endpoint with `availability_status` `active` and `is_active_gateway` `true`, with every required parameter. Then hand a smoke request to `phaseo-gateway` and check the response `model` field.

## Aliases, pinned IDs and the free router

- **Pinned ID** such as `anthropic/claude-sonnet-5`: behaviour and price change only when you change the ID. Use it for production, evaluations and anything you must reproduce.
- **Alias** such as `anthropic/claude-sonnet-latest`: resolves to a concrete model when the request is made and can move to a newer model. Use it only when following a family is intended. To see the target, find the model whose `aliases` array contains the alias (`GET /v1/models?organisation=anthropic&limit=250`).
- **`:free` variants**: model IDs ending in `:free` run without deposited credits. Related variants of a model are listed under `variants`.
- **`phaseo/free`**: routes each request to an available free model that supports it. Good for prototypes, demos and smoke tests; not for predictable latency, output style or provider. The served model appears in the response and request details. If no free model supports a needed feature, pick a paid model instead of retrying. Free requests share a daily allowance (see the Limits page).
- **Provider-qualified IDs** (`<provider-id>:<model-id>`) pin one provider and disable cross-provider fallback. Whether to use them is routing policy: hand off to `phaseo-routing-presets`.

## Deprecated, retired and replaced models

Each model has `lifecycle`: `status` (`active`, `deprecated`, `retired` or `null`), `deprecated_at`, `retires_at`, `replacement_id` and `message`.

1. Do not choose a `deprecated` or `retired` model for new work. Add `status=active` when shortlisting.
2. When `replacement_id` is not `null`, treat it as a candidate, not a drop-in: compare its endpoints, parameters, context, price per offer and benchmark evidence, and test it with representative prompts.
3. When `replacement_id` is `null`, run the workflow again with the old model's requirements.
4. A model that no provider serves fails with `410` and `error: "model_retired"`. The error's `replacement_model` is the suggestion or `null`. Retrying never helps; change the model ID in code, presets and dynamic routes.
5. To keep traffic flowing during a migration, the old model can stay primary with the replacement as a fallback in `models`, or the workspace can turn on retired-model routing. Both are routing policy: hand off to `phaseo-routing-presets`.

## Estimate cost

Price each offer separately, because the provider that serves the request sets the price. Meter rates are strings: `rate per token = price_per_unit / unit_size`, and `price per million = rate × 1,000,000`.

Worked example, with illustrative rates read from one offer's `pricing.meters` (not current prices):

```text
Assumptions: 50,000 requests a month; 1,200 input and 300 output tokens each;
no cached input; standard tier; one provider offer; no tool, search or media meters.
Offer meters: input_text_tokens  price_per_unit "1.50", unit_size 1000000  -> $1.50 per 1M
              output_text_tokens price_per_unit "6.00", unit_size 1000000  -> $6.00 per 1M

Input tokens:  50,000 × 1,200 = 60,000,000 -> 60 × $1.50 = $90.00
Output tokens: 50,000 ×   300 = 15,000,000 -> 15 × $6.00 = $90.00
Estimated total: $180.00 a month (USD, estimate, not a bill)
```

- With prompt caching, price cached tokens at the offer's cached-read meter and the rest at the input rate.
- Reasoning models can emit far more output tokens than the visible answer; measure a pilot run before relying on the output figure.
- Add any other meter the workload triggers (cache writes, requests, images, audio, web search).
- Cross-check with `phaseo:cost_estimate` (`modelId`, optional `providerId`, `inputTokens`, `cachedInputTokens`, `outputTokens`). It picks the cheapest paid routable offer unless you pass `providerId`; report the `providerId` it returns.

## Report

Give a short table: model ID, why it fits, context, input and output price per 1M with the provider, verified capabilities, lifecycle status, and quality evidence with its benchmark name. Then name the pinned ID, the alternative, and every assumption. Never present an ID, price or capability you did not read in this session.
