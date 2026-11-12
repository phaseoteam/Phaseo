# Phaseo catalogue API for model selection

## Contents

- [Base URLs and auth](#base-urls-and-auth)
- [GET /v1/models](#get-v1models)
- [Model fields that matter](#model-fields-that-matter)
- [Reading prices](#reading-prices)
- [GET /v1/models/{author}/{slug}/endpoints](#get-v1modelsauthorslugendpoints)
- [Other catalogue endpoints](#other-catalogue-endpoints)
- [Shortlisting recipes](#shortlisting-recipes)

The OpenAPI file `https://phaseo.app/docs/openapi/v1/openapi.yaml` is the contract. Read live responses defensively: the example on the docs page for listing models still shows an older shape (`providers`, `pricing_detail`, top-level `status`), while the OpenAPI `Model` schema uses `offers`, `pricing` and `lifecycle`.

## Base URLs and auth

- Global: `https://api.phaseo.app/v1`
- EU text routing: `https://eu.api.phaseo.app/v1`
- US text routing: `https://us.api.phaseo.app/v1`

Send `Authorization: Bearer $PHASEO_API_KEY`. Discover models on the same host the application will call, because availability differs by region.

## GET /v1/models

Returns routable models by default. Responses are cached for about five minutes.

**Discovery parameters**

| Parameter | Meaning |
| --- | --- |
| `search` | Case-insensitive match on model ID, name, description and organisation (max 200 characters) |
| `provider_search` | Case-insensitive provider or organisation match |
| `input_modality` | One of `text`, `image`, `audio`, `video` |
| `minimum_context_tokens` | Minimum input context |
| `maximum_input_price_per_million` | Maximum USD input price per 1M tokens |
| `gateway_available_only` | Only models with a routable offer |
| `sort_by` | `relevance` (default), `input_price`, `output_price`, `context_length`, `provider_count` |
| `sort_order` | `asc` or `desc`; price sorts default to ascending, other numeric sorts to descending |

**Filters** (array-valued; repeat the parameter to pass several values)

| Parameter | Meaning |
| --- | --- |
| `endpoints` | Public endpoint IDs, for example `chat.completions`, `responses`, `messages`; get the rest from `GET /v1/endpoints` |
| `organisation` | Model ID prefix, for example `anthropic` |
| `provider` | Provider ID, for example `openai`, `anthropic`, `google_vertex` |
| `status` | Model lifecycle: `active`, `deprecated`, `retired` |
| `input_modalities` / `output_modalities` | Aliases of `input_types` / `output_types` |
| `supported_parameters` | Alias of `params`, for example `tools`, `structured_outputs` |
| `provider_status`, `provider_routing_status`, `model_routing_status`, `capability_status`, `provider_availability_status`, `provider_availability_reason` | Provider and route state |

**Paging and format**

- `limit` 1 to 250 (default 50), `offset` 0 to 5000.
- `availability=active` (default) or `all`, which adds coming-soon, inactive and not yet routable entries. Use `all` only to inspect, never to choose a production model.
- `format=json` (default), `openai` (OpenAI model-list shape, all matching models unless `limit` is set), `rss` or `atom`.
- JSON and OpenAI responses carry a weak `ETag`; send it back in `If-None-Match` to get `304 Not Modified`. Keep one `ETag` per URL.

## Model fields that matter

| Field | Use |
| --- | --- |
| `id` | The model ID to send as `model` |
| `variant`, `variants` | Standard and free variants of the same base model (`base_model_id`) |
| `aliases` | Alias IDs that resolve to this model |
| `lifecycle.status` | `active`, `deprecated`, `retired` or `null` |
| `lifecycle.deprecated_at`, `lifecycle.retires_at` | Lifecycle dates, when known |
| `lifecycle.replacement_id` | Suggested replacement, or `null` |
| `lifecycle.message` | Human-readable lifecycle note |
| `modalities.input`, `modalities.output` | For example `image` in input means vision |
| `limits.input_tokens`, `limits.output_tokens` | Context window and output cap; can be `null` |
| `capabilities.endpoints`, `capabilities.parameters`, `capabilities.parameter_details` | Union across providers |
| `availability.status`, `availability.active_provider_count` | Gateway availability, not quality |
| `pricing` | Standard-tier meters for the model |
| `offers[]` | One per provider: `provider.id`, `model` (provider's model slug), `status`, `status_reason`, `routable`, `endpoints`, `modalities`, `capabilities`, `service_tiers`, `pricing`, and `residency` (`execution_regions`, `data_regions`) |

Choose from offers where `routable` is `true`. A capability in `capabilities.parameters` may be supported by only some offers.

## Reading prices

Each meter has `provider_id`, `unit`, `unit_size`, `price_per_unit` (a string) and `currency` (`USD`). Token meters are keyed by names such as `input_text_tokens` and `output_text_tokens`; cached-input meters appear as separate keys. Read whatever keys the offer returns.

```text
rate per token   = Number(price_per_unit) / unit_size
price per 1M     = rate per token × 1,000,000
cost             = tokens × rate per token
```

Prices under `pricing` are standard tier. `offers[].service_tiers` lists the tiers an offer accepts (`flex`, `priority`, `standard`, `ultrafast`); other tiers can cost more or less.

## GET /v1/models/{author}/{slug}/endpoints

One row per provider and endpoint capability: public path, provider ID and model slug, modalities, supported parameters and detail, provider, routing, capability and availability states, effective dates, and a pricing summary.

```bash
curl "https://api.phaseo.app/v1/models/anthropic/claude-sonnet-5/endpoints" \
  -H "Authorization: Bearer $PHASEO_API_KEY"
```

- Default `availability=active` returns only routable rows; `availability=all` adds planned and inactive rows.
- Filters (repeatable or comma-separated): `provider`, `provider_status`, `provider_routing_status`, `model_routing_status`, `capability_status`, `provider_availability_status`, `provider_availability_reason`, `status`, `supported_parameters`.
- Route production traffic only to rows with `availability_status` `active` and `is_active_gateway` `true`.

## Other catalogue endpoints

| Endpoint | Returns |
| --- | --- |
| `GET /v1/endpoints` | `endpoints` (canonical IDs), `data[]` with `public_path`, `collection`, `model_count`, `provider_count`, and `sample_models` |
| `GET /v1/providers` | `providers[]` with `api_provider_id`, `api_provider_name`, `description`, `link`, `country_code`; `limit` up to 250 |
| `GET /v1/pricing/models` | Active pricing cards, one per provider, model and endpoint, with their meters |
| `POST /v1/pricing/calculate` | Price for `provider`, `model`, `endpoint` and a `usage` object; check the OpenAPI spec for the usage shape |
| `GET /v1/videos/models`, `GET /v1/batches/models` | Video and batch models; need workspace preview access |

## Shortlisting recipes

Vision with tools, at least 128K context, active, cheapest input first:

```bash
curl -s "https://api.phaseo.app/v1/models?input_modality=image&supported_parameters=tools&minimum_context_tokens=128000&status=active&sort_by=input_price&limit=50" \
  -H "Authorization: Bearer $PHASEO_API_KEY" \
  | jq -r '.models[] | [.id, .limits.input_tokens, .lifecycle.status,
      ([.offers[] | select(.routable) | .provider.id] | join(","))] | @tsv'
```

Per-offer token prices for one shortlisted model:

```bash
curl -s "https://api.phaseo.app/v1/models?search=<model-id>&limit=5" \
  -H "Authorization: Bearer $PHASEO_API_KEY" \
  | jq -r '.models[] | .id as $id | .offers[] | select(.routable)
      | [$id, .provider.id,
         (.pricing.meters.input_text_tokens  | if . then ((.price_per_unit|tonumber) / .unit_size * 1000000) else "n/a" end),
         (.pricing.meters.output_text_tokens | if . then ((.price_per_unit|tonumber) / .unit_size * 1000000) else "n/a" end)]
      | @tsv'
```

Deprecated models that still route, with their replacements:

```bash
curl -s "https://api.phaseo.app/v1/models?status=deprecated&limit=250" \
  -H "Authorization: Bearer $PHASEO_API_KEY" \
  | jq -r '.models[] | [.id, .lifecycle.retires_at, (.lifecycle.replacement_id // "none")] | @tsv'
```

Embedding models: read the embeddings endpoint ID from `GET /v1/endpoints`, then call `GET /v1/models?endpoints=<endpoint-id>`.
