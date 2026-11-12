# Cloudflare AI Gateway to Phaseo

## Detection signals

- `gateway.ai.cloudflare.com/v1/<account_id>/<gateway_id>/<provider>` base URLs (`/openai`, `/anthropic`, `/compat` and others)
- `api.cloudflare.com/client/v4/accounts/<account_id>/ai/v1` base URLs (Cloudflare's unified API, authenticated with a Cloudflare API token) and the `cf-aig-gateway-id` header
- `cf-aig-*` request headers, such as `cf-aig-authorization`, `cf-aig-cache-ttl`, `cf-aig-skip-cache`, `cf-aig-cache-key`, `cf-aig-metadata`, `cf-aig-collect-log`, `cf-aig-custom-cost`, `cf-aig-request-timeout`, `cf-aig-max-attempts`
- Workers AI bindings called with a gateway option: `env.AI.run(model, input, { gateway: { id } })`, or `env.AI.gateway(id).getUrl(provider)` used as a base URL
- `dynamic/<route>` or `cloudflare/auto` model strings
- Account ID and gateway ID values in `wrangler` config or env files, alongside provider keys

## Before and after

Smallest change: swap the Cloudflare URL and the provider key for Phaseo, and drop the `cf-aig-*` headers.

```ts
// Before
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/openai`,
  defaultHeaders: { "cf-aig-authorization": `Bearer ${process.env.CF_AIG_TOKEN}` },
});

// After
const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});
```

Provider-specific routes change client by client: an `/anthropic` route moves to the Anthropic SDK setup in [anthropic.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/anthropic.md); an OpenAI-compatible route moves to `https://api.phaseo.app/v1`.

Workers AI binding calls are not HTTP clients. Replace them with `fetch` or the OpenAI SDK against Phaseo, and only for models that `GET /v1/models?format=openai` lists:

```ts
const res = await fetch("https://api.phaseo.app/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${env.PHASEO_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "phaseo/free",
    messages: [{ role: "user", content: "Reply with: migration ready" }],
  }),
});
```

Store `PHASEO_API_KEY` as a Worker secret, not in `wrangler` config.

## Feature mapping

| Cloudflare AI Gateway | Phaseo | Notes |
| --- | --- | --- |
| Per-provider routes and stored provider keys | One base URL; Phaseo-managed providers or BYOK | Model ID selects the model; routing picks the provider |
| Fallback chains | `models` array, provider fallback, dynamic routes | Model fallbacks trigger on 429, 500, 502, 503 and 504, never on request errors |
| `dynamic/<route>` | Dynamic routes, attached to API keys | Send a real model ID |
| `cloudflare/auto` | `phaseo/auto` | Alpha for selected workspaces; can't be combined with `models` |
| Caching (`cf-aig-cache-ttl`, `cf-aig-skip-cache`, `cf-aig-cache-key`) | No equivalent yet | Phaseo does not cache responses; cache in the app if needed. Prompt caching (`cache_control`) still cuts input cost |
| `cf-aig-metadata` | `X-Phaseo-Metadata` labels | Up to 32 labels; keys match `[A-Za-z0-9_.:-]` (up to 64 characters), values are strings of up to 256, so convert numbers and booleans |
| `cf-aig-collect-log`, `cf-aig-collect-log-payload` | Workspace logging policy, or `provider.require_zero_data_retention` | Zero data retention also limits routing to ZDR providers |
| `cf-aig-request-timeout`, `-max-attempts`, `-retry-delay`, `-backoff` | No per-request control | Built-in provider fallback plus client backoff |
| `cf-aig-session-id` | `session_id` body field | |
| `cf-aig-custom-cost` | No equivalent | |
| Rate limiting | Rate limit policies and key limits | See `phaseo-guardrails` |
| Spend limits, Unified Billing | Workspace, key and department budgets; Phaseo credits | Budgets return 429 `key_limit_exceeded` when reached |
| Guardrails and DLP | Key and member guardrails: prompt injection and PII (built-in or custom regex) on requests, with flag, redact or block | Responses are not scanned and there are no content-safety categories; keep those in the app or call `/v1/moderations` |
| Logs and analytics | Request logs, activity, observability destinations (Langfuse, Datadog, any OTLP collector, a webhook and others) | Request details include provider attempts and pricing |
| Workers AI `@cf/...` models | Only if listed by `GET /v1/models?format=openai` | Otherwise keep those calls on Workers AI |

## Gotchas

- Decide explicitly whether each cache or analytics behavior belongs in Phaseo, the application, or the edge layer.
- Remove every `gateway.ai.cloudflare.com` and `api.cloudflare.com/.../ai/v1` URL and every `cf-aig-*` header; a leftover route keeps traffic on the old path.
- Edge code calling Phaseo still needs the key as a secret; never ship it to a browser.
