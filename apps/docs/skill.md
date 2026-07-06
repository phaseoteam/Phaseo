---
name: phaseo
description: Use Phaseo when you need one API for multiple AI providers, stable model discovery, routing controls, pricing visibility, async jobs, or agent-ready gateway workflows.
compatibility: Public Mintlify documentation with OpenAPI-backed API reference pages. Best used by agents that can read Markdown docs, follow links, and make HTTP requests.
metadata:
  author: Phaseo
  version: "1.1"
---

# Phaseo

Phaseo gives developers and agents one way to call many AI providers through a single API.

## What Phaseo is for

Use Phaseo when you need to:

- send requests to multiple providers through one API
- discover models and providers before sending traffic
- route by price, latency, throughput, or explicit provider preference
- enforce policy through presets and guardrails
- run async jobs for video, music, or batches
- build agent workflows that use server-side tools like web search, web fetch, or datetime

## The fastest way to make a request

Most integrations start with:

1. an API key
2. an endpoint
3. a model ID or preset
4. optional routing or provider controls

### Base URL

`https://api.phaseo.ai/v1`

### Auth

`Authorization: Bearer <PHASEO_API_KEY>`

### Common first endpoint

`POST /v1/responses`

### Minimal request

```json
{
  "model": "openai/gpt-5-nano",
  "input": "Reply with: integration works"
}
```

## Endpoint selection

Pick the endpoint that matches the client or workflow you already have:

- `/v1/responses` for most new text integrations
- `/v1/chat/completions` for OpenAI-style chat clients
- `/v1/messages` for Anthropic-style clients
- `/v1/embeddings` for embeddings
- `/v1/images/generations` for image generation
- `/v1/videos` for async video jobs
- `/v1/batches` for async batch execution

## What an agent should check before sending traffic

Before making assumptions:

1. check the model catalogue
2. check whether the endpoint is supported
3. check whether routing or provider constraints apply
4. check whether the workflow is sync or async

Useful discovery endpoints:

- `GET /v1/models`
- `GET /v1/providers`
- `GET /v1/pricing/models`

## Routing controls

Phaseo can:

- choose providers automatically
- sort providers by price, latency, or throughput
- pin requests to specific providers
- ignore specific providers
- apply preset defaults before routing

## Policy controls

Use:

- presets for reusable request defaults
- guardrails for API-key and workspace policy
- response healing for strict JSON workflows

## Async workflows

For video, music, and batch jobs:

- create the job first
- poll or subscribe for status
- retrieve output after completion

Do not assume async endpoints return final content immediately.

## Agent workflows

Phaseo supports agentic workflows through:

- gateway-native tools like `phaseo:web_search`, `phaseo:web_fetch`, and `gateway:datetime`
- Agent SDK docs and examples
- structured-output and response-healing workflows

## Best starting pages

### First request

- `v1/quickstart`
- `v1/api-reference/introduction`
- `v1/api-reference/endpoint/responses`

### Routing and provider control

- `v1/guides/routing-and-fallbacks`
- `v1/guides/presets`
- `v1/cookbook/preset-rollout-and-routing-debug`

### Agent workflows

- `v1/sdk-reference/agent-sdk/overview`
- `v1/cookbook/agent-sdk-durable-loop`
- `v1/cookbook/agent-sdk-research-brief`

### Migration

- `v1/migration-guides/index`
- `v1/migration-guides/from-openrouter`
- `v1/migration-guides/from-vercel`
- `v1/migration-guides/from-llmgateway`

## Constraints

- Some endpoints require a management API key instead of a standard gateway key.
- Some models or providers may be visible but not currently routable.
- Provider availability, pricing, and capability support can vary by endpoint.
- Async endpoints require polling, webhooks, websocket updates, or follow-up retrieval.

## Recommended agent behavior

- Prefer discovery endpoints before assuming support.
- Prefer presets when a workflow has stable defaults.
- Treat pricing and provider availability as dynamic.
- Use request IDs and activity views for debugging instead of guessing from error text.
