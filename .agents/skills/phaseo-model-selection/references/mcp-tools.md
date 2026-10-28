# Phaseo MCP tools for model selection

The `phaseo` MCP server (`https://mcp.phaseo.app/mcp`) connects through Phaseo OAuth. Never ask the user to paste a key into chat. Tools appear only when the connection has the scopes listed; if one is missing, say which capability is unavailable and fall back to the REST API. Read each tool's input schema from the server before calling it.

All tools below are read-only. The model, provider and cost tools read `GET /v1/models` and `GET /v1/providers`, so their data matches the REST API. Rankings come from Phaseo's benchmark data, which has no Gateway API endpoint.

## phaseo:models_list

Scopes: `models:read`, `pricing:read`. In hosts that support MCP Apps it also opens the interactive model explorer; reuse its first result instead of calling it again.

| Parameter | Type | Notes |
| --- | --- | --- |
| `query` | string, optional | Free-text search |
| `provider` | string, optional | Provider or organisation search |
| `modality` | `text`, `image`, `audio`, `video` | Input modality only |
| `minimumContextTokens` | integer, optional | |
| `maximumInputPricePerMillion` | number, optional | Compared with the lowest paid input price |
| `gatewayAvailableOnly` | boolean, default `false` | |
| `sortBy` | `relevance`, `input_price`, `output_price`, `context_length`, `provider_count` | Default `relevance` |
| `sortOrder` | `asc`, `desc` | |
| `limit` | 1 to 20, default 10 | Refine filters to see other models |

It cannot filter by output modality, endpoint or parameter. For embeddings, rerank, speech and similar workloads, use `query` and check `supportedEndpoints`, or use REST `endpoints`.

## phaseo:model_get

Scopes: `models:read`, `pricing:read`. Input: `modelId`. Use it to refresh details before quoting a price.

## Model result fields (both tools)

| Field | Meaning |
| --- | --- |
| `id`, `name`, `description`, `provider`, `releaseDate` | Identity; `provider` is the organisation name |
| `contextTokens` | `limits.input_tokens` from REST |
| `inputModalities`, `outputModalities`, `supportedEndpoints` | Capabilities |
| `inputPricePerMillion`, `outputPricePerMillion` | Lowest paid rate across routable offers; input and output can come from different providers |
| `inputPriceProviderId`, `outputPriceProviderId` | Provider behind each lowest rate |
| `hasFreeProvider` | A routable offer is free; this does not make every offer free |
| `supportsTools` | `tools` is in the model's parameters |
| `gatewayAvailable`, `gatewayModelId` | Whether it routes now, and the ID to send |
| `availableProviders` | Routable provider IDs |
| `providerSupport[]` | Per offer: `providerId`, `providerModelId`, `status`, `routable`, `supportedParameters`, `pricing` |
| `modelUrl` | Informational model page |

The MCP results have no lifecycle fields. Check `lifecycle` with REST before recommending a model.

## phaseo:benchmark_rankings

Scopes: `models:read`, `pricing:read`.

| Parameter | Values |
| --- | --- |
| `focus` | `general` (default), `coding`, `agentic`, `cost_efficiency` |
| `gatewayAvailableOnly` | boolean, default `false` |
| `limit` | 1 to 20, default 10 |

Returns `benchmark` (`id`, `name`, `focus`, `lowerIsBetter`, `totalModels`) and `entries[]` (`rank`, `modelId`, `name`, `provider`, `score`, `gatewayAvailable`, `gatewayModelId`, `sourceUrl`, `updatedAt`). Report the benchmark name and source. The order is the benchmark's; availability never changes it. `cost_efficiency` is benchmark evaluation cost, not token price.

## phaseo:providers_list

Scope: `providers:read`. No input. Returns `providers[]` with `api_provider_id`, `api_provider_name`, `description`, `link`, `country_code`.

## phaseo:cost_estimate

Scopes: `models:read`, `pricing:read`.

| Parameter | Notes |
| --- | --- |
| `modelId` | Required |
| `providerId` | Optional; without it, the cheapest paid routable offer with complete pricing is used |
| `inputTokens`, `outputTokens` | Required, non-negative integers; pass workload totals |
| `cachedInputTokens` | Default 0 |

Returns `estimate` with `providerId`, `pricingPlan`, `isFree`, the three token counts, `inputCostUSD`, `cachedInputCostUSD`, `outputCostUSD`, `totalCostUSD` and `currency` `USD`. Present it as an estimate, include the `providerId`, and list the token assumptions.

## Not for model selection

`credits_get`, `activity_list`, `analytics_get`, `logs_list`, `log_get` and `generation_get` cover spend and request history: use `phaseo-usage-monitoring`. The explorer's prompt runs are billable and start only from an explicit user action; never start one yourself.
