# Helicone to Phaseo

The request change is small; plan the observability cutover as carefully as the endpoint change.

## Detection signals

- `*.helicone.ai` base URLs, for example `oai.helicone.ai/v1`, `anthropic.helicone.ai`, `ai-gateway.helicone.ai`, or `gateway.helicone.ai` with `Helicone-Target-URL`
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

Helicone AI Gateway clients (`https://ai-gateway.helicone.ai`) use `HELICONE_API_KEY` as the API key and put routing in the `model` string. Split it: the first comma-separated entry becomes `model` and the rest become the `models` array; a `<model>/<provider>` pin becomes `provider.only` (or a `provider:org/model` ID); a `!provider` exclusion becomes `provider.ignore`.

## Feature mapping

| Helicone | Phaseo | Notes |
| --- | --- | --- |
| `Helicone-Auth` | Remove | Phaseo authenticates with `PHASEO_API_KEY` alone |
| `Helicone-Property-<Name>` | `X-Phaseo-Metadata` labels | Up to 32 labels; filter spend with `GET /v1/analytics?label_key=&label_value=` |
| `Helicone-User-Id` | `user` body field or `X-Phaseo-User-Id` | Also keys end-user rate limit policies |
| `Helicone-Session-Id` | `session_id` body field | Drives cache and session affinity; not a trace tree |
| `Helicone-Session-Path`, `Helicone-Session-Name` | Body `metadata.trace_id`, `parent_span_id`, `trace_name`, `span_name`, or a W3C `traceparent` header | Shapes the spans sent to observability destinations; Phaseo's own logs have no trace tree |
| `Helicone-Cache-Enabled` | No equivalent yet | Phaseo does not cache responses; cache in the app if needed |
| `Helicone-Retry-Enabled` | Built-in provider fallback plus `models` | Keep client backoff for 429 and 5xx |
| `Helicone-Fallbacks` | `models` array | Triggers on 429, 500, 502, 503 and 504 |
| `Helicone-RateLimit-Policy` | Rate limit policies and key limits | See `phaseo-guardrails` |
| `Helicone-LLM-Security-Enabled` | Guardrail prompt-injection detection | Requests only |
| `Helicone-Moderations-Enabled` | No in-gateway equivalent | Call `/v1/moderations` from the app |
| `Helicone-Omit-Request`, `Helicone-Omit-Response` | Workspace logging policy or zero data retention | |
| `Helicone-Posthog-*` | PostHog observability destination | |
| Prompt management (`prompt_id`, `version_id`, `environment`, `inputs`) | Preset prompt templates: `"prompt": {"id": "@slug", "version": "production", "variables": {...}}` | Labels such as `production` pick the version |
| Dashboards, alerts | Request logs, activity, workspace notifications, observability destinations (Langfuse, Datadog, PostHog, any OTLP collector, a webhook and others) | Confirm the team can still answer incident questions |

## Gotchas

- `X-Phaseo-Metadata` must be a JSON object; malformed values or duplicate keys are rejected with `400`. Label keys must match `[A-Za-z0-9_.:-]` (up to 64 characters), so rename Helicone property names with spaces. Do not put personal data in labels.
- Helicone's async logging (no proxy) does not route traffic. Removing it is a separate decision from the gateway swap.
- Connect any required telemetry export before cutover so there is no visibility gap.
