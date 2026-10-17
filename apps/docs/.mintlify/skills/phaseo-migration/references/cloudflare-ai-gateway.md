# Cloudflare AI Gateway to Phaseo

## Detection signals

- `gateway.ai.cloudflare.com/v1/<account_id>/<gateway_id>/<provider>` base URLs (`/openai`, `/anthropic`, `/compat` and others)
- `cf-aig-*` request headers, such as `cf-aig-authorization`, `cf-aig-cache-ttl`, `cf-aig-skip-cache`, `cf-aig-metadata`
- Workers AI bindings called with a gateway option: `env.AI.run(model, input, { gateway: { id } })`
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

Workers AI binding calls are not HTTP clients. Replace them with `fetch` or the OpenAI SDK against Phaseo, and only for models that `GET /v1/models` lists:

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
| Fallback chains | `models` array, provider fallback, dynamic routes | Model fallbacks trigger on 429 and 5xx |
| Caching (`cf-aig-cache-ttl`, `cf-aig-skip-cache`) | Preset-level response caching | Does not transfer automatically; recreate only if needed |
| `cf-aig-metadata` | `X-Phaseo-Metadata` labels | Up to 32 key/value labels, filterable in analytics |
| Rate limiting | Rate limit policies and key limits | See `phaseo-guardrails` |
| Guardrails and DLP | Key guardrails | See `phaseo-guardrails`; verify coverage per rule |
| Logs and analytics | Request logs, activity, observability destinations | Request details include provider attempts and pricing |
| Workers AI `@cf/...` models | Only if listed by `GET /v1/models` | Otherwise keep those calls on Workers AI |

## Gotchas

- Decide explicitly whether each cache or analytics behavior belongs in Phaseo, the application, or the edge layer.
- Remove every `gateway.ai.cloudflare.com` URL and `cf-aig-*` header; a leftover route keeps traffic on the old path.
- Edge code calling Phaseo still needs the key as a secret; never ship it to a browser.
