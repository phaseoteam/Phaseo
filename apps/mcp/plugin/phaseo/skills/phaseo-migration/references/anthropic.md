# Anthropic to Phaseo

## Detection signals

- `api.anthropic.com`, or an `Anthropic` client created without `baseURL` / `base_url`
- `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`
- `@anthropic-ai/sdk`, `anthropic` (PyPI), `AnthropicBedrock`, `AnthropicVertex`
- `anthropic-beta` headers, model names such as `claude-sonnet-4-6`

## Before and after

Smallest change: keep the Anthropic SDK and the Messages call. Point the client at the root host, because the SDK appends `/v1/messages` itself, and pass the Phaseo key as a bearer token.

```ts
// Before
const client = new Anthropic();

// After
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: null,
  authToken: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app",
});

const message = await client.messages.create({
  model: "phaseo/free",
  max_tokens: 256,
  messages: [{ role: "user", content: "Reply with: migration ready" }],
});
```

```python
import os
from anthropic import Anthropic

client = Anthropic(
    auth_token=os.environ["PHASEO_API_KEY"],
    base_url="https://api.phaseo.app",
)

message = client.messages.create(
    model="phaseo/free",
    max_tokens=256,
    messages=[{"role": "user", "content": "Reply with: migration ready"}],
)
```

`authToken` / `auth_token` sends `Authorization: Bearer`, which the gateway authenticates. In TypeScript, `apiKey: null` stops the SDK from also reading `ANTHROPIC_API_KEY` and forwarding the Anthropic key; the Python SDK falls back to that variable when `api_key` is `None`, so remove `ANTHROPIC_API_KEY` from environments that now call Phaseo. Raw HTTP calls go to `https://api.phaseo.app/v1/messages` with `Authorization: Bearer $PHASEO_API_KEY`.

Then map model names to Phaseo IDs, for example `claude-sonnet-4-6` to `anthropic/claude-sonnet-4.6`, after `GET /v1/models` confirms the exact ID.

Tools that read environment variables (Claude Code and similar) use `ANTHROPIC_BASE_URL=https://api.phaseo.app`, `ANTHROPIC_AUTH_TOKEN` set to the Phaseo key, and an empty `ANTHROPIC_API_KEY`.

## Feature mapping

| Anthropic feature | Phaseo | Notes |
| --- | --- | --- |
| Messages, streaming SSE events | `/v1/messages` | Anthropic-formatted responses and events |
| Tool use | Supported | Retest streamed tool loops before rollout |
| Native web search tool (`web_search_20250305`) | Accepted in `tools` where the provider supports it | Or Phaseo server tools such as `phaseo:web_search`; see `phaseo-web-search-tools` |
| `cache_control` prompt caching | Supported, top level or per block | Check cache pricing on the model page |
| `system` prompt | Supported | A preset's prompt is prepended to it |
| `service_tier` | Supported | Provider- and model-specific |
| `anthropic-beta` headers and beta-only fields | Review each one | Remove rather than carry forward blindly |
| Message Batches (`/v1/messages/batches`) | No such path; Phaseo has `/v1/batches` | Different shape; see `phaseo-async-webhooks` |
| Token counting (`/v1/messages/count_tokens`) | No path in the Phaseo API reference | Keep on Anthropic or estimate client-side |
| `AnthropicBedrock` / `AnthropicVertex` clients | Replace with the plain `Anthropic` client | Cloud-specific auth and region settings do not apply |

## Gotchas

- `baseURL: "https://api.phaseo.app/v1"` produces `/v1/v1/messages`. Use the root host for the Anthropic SDK; OpenAI-compatible clients in the same repo still use `/v1`.
- The SDK's `apiKey` option sends `x-api-key`; the gateway reads `Authorization: Bearer`. Use `authToken`.
- Test thinking or reasoning options, structured output and streamed tool loops with the exact model IDs the app uses.
- Switching the same code to the OpenAI SDK is optional and a larger diff; only do it if the user wants one client.
