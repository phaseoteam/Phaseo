# Helicone to Phaseo

The request change is small; plan the observability cutover as carefully as the endpoint change.

## Detection signals

- `*.helicone.ai` base URLs, for example `oai.helicone.ai/v1`, `anthropic.helicone.ai`, `ai-gateway.helicone.ai`
- `Helicone-Auth` header and `HELICONE_API_KEY`
- Other `Helicone-*` headers: `Helicone-Property-*`, `Helicone-User-Id`, `Helicone-Session-*`, `Helicone-Cache-Enabled`, `Helicone-Retry-Enabled`, `Helicone-RateLimit-Policy`
- Helicone packages used for async logging rather than proxying

## Before and after

Smallest change: swap the base URL and key, remove `Helicone-Auth`, then map the headers you still need.

```ts
// Before
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://oai.helicone.ai/v1",
  defaultHeaders: {
    "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
    "Helicone-Property-Team": "support",
  },
});

// After
const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
  defaultHeaders: {
    "X-Phaseo-Metadata": JSON.stringify({ labels: [{ key: "team", value: "support" }] }),
  },
});
```

Per-request values (user IDs, session IDs) go on the request instead of the client:

```ts
await client.chat.completions.create(
  { model: "phaseo/free", messages: [{ role: "user", content: "Reply with: ok" }] },
  { headers: { "X-Phaseo-User-Id": userId } },
);
```

Python clients use `default_headers=` and `extra_headers=` the same way. Anthropic-proxy routes (`anthropic.helicone.ai`) move to the setup in [anthropic.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/anthropic.md).

## Feature mapping

| Helicone | Phaseo | Notes |
| --- | --- | --- |
| `Helicone-Auth` | Remove | Phaseo authenticates with `PHASEO_API_KEY` alone |
| `Helicone-Property-<Name>` | `X-Phaseo-Metadata` labels | Up to 32 labels; filter spend with `GET /v1/analytics?label_key=&label_value=` |
| `Helicone-User-Id` | `user` body field or `X-Phaseo-User-Id` | Also keys end-user rate limit policies |
| `Helicone-Session-Id` | `session_id` body field | Drives cache and session affinity; not a trace tree |
| `Helicone-Session-Path`, `Helicone-Session-Name` | No direct equivalent | Use labels or keep client-side tracing |
| `Helicone-Cache-Enabled` | Preset-level response caching | Recreate only for deterministic prompts |
| `Helicone-Retry-Enabled` | Built-in provider fallback plus `models` | Keep client backoff for 429 and 5xx |
| `Helicone-RateLimit-Policy` | Rate limit policies and key limits | See `phaseo-guardrails` |
| Prompt management | Presets (`"model": "@slug"`) | System prompt and parameter defaults |
| Dashboards, alerts | Request logs, activity, workspace notifications, observability destinations | Confirm the team can still answer incident questions |

## Gotchas

- `X-Phaseo-Metadata` must be a JSON object; malformed values or duplicate keys are rejected with `400`. Do not put personal data in labels.
- Helicone's async logging (no proxy) does not route traffic. Removing it is a separate decision from the gateway swap.
- Connect any required telemetry export before cutover so there is no visibility gap.
