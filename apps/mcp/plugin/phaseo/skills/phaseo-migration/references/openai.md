# OpenAI to Phaseo

## Detection signals

- `api.openai.com` in code or config, or an `openai` client created without `baseURL` / `base_url`
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_ORG_ID`, `OPENAI_PROJECT_ID`
- `openai` (npm or PyPI), `AzureOpenAI`, `langchain_openai` / `@langchain/openai`
- Azure OpenAI: `*.openai.azure.com`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `/openai/v1/` base URLs (Azure's v1 API uses the plain `OpenAI` client, so `AzureOpenAI` alone misses it)
- Unprefixed model names such as `gpt-4.1-mini`

## Before and after

Smallest change: pass the Phaseo key and base URL to the existing client. Request code stays the same apart from the model ID.

```ts
// Before
const client = new OpenAI();

// After
const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});

const response = await client.responses.create({
  model: "phaseo/free",
  input: "Reply with: migration ready",
});
```

```python
# Before
client = OpenAI()

# After
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["PHASEO_API_KEY"],
    base_url="https://api.phaseo.app/v1",
)

completion = client.chat.completions.create(
    model="phaseo/free",
    messages=[{"role": "user", "content": "Reply with: migration ready"}],
)
```

Then replace each model name with its Phaseo ID, for example `gpt-4.1-mini` becomes `openai/gpt-4.1-mini` once `GET /v1/models?format=openai` confirms it. Azure deployment names map to Phaseo model IDs the same way.

Wrappers that build an OpenAI client (Langfuse's `langfuse.openai`, LangChain `ChatOpenAI`) take the same base URL and key.

## Feature mapping

| OpenAI feature | Phaseo | Notes |
| --- | --- | --- |
| Chat Completions, Responses | `/v1/chat/completions`, `/v1/responses` | Same request shapes; unknown top-level fields return 400 `unknown_param` |
| Embeddings, moderations, images, speech, transcription, translation | `/v1/embeddings`, `/v1/moderations`, `/v1/images/*`, `/v1/audio/*` | Check the model supports the operation |
| Batch API | `/v1/files`, `/v1/batches` | `/v1/files` holds batch input only; it cannot supply `file_id` inputs to other requests. See `phaseo-async-webhooks` |
| Realtime | `POST /v1/audio/realtime/sessions` (alias `/v1/realtime/sessions`), then a WebSocket to the returned `connect.url` | Subprotocols `statsync-realtime` and `rtsec.<client_secret>`; audio is sent as `client.audio` events. No WebRTC and no direct `wss://…/v1/realtime`, so OpenAI SDK realtime helpers need an adapter or the Phaseo SDK's `client.realtime.connect()` |
| Hosted tools (`web_search`, `code_interpreter`, `image_generation`, `mcp`, `shell`) | Routed only to providers that run them | On other models `web_search` becomes `phaseo:web_search`; any other hosted tool returns 400 |
| Stored prompts (`prompt: { id: "pmpt_…" }`) | Preset prompt templates: `prompt: { id: "@slug", version, variables }` | Recreate the prompt as a Phaseo preset |
| `service_tier` | Supported on all three text endpoints | `flex`, `fast` (OpenAI's `priority` is accepted), `ultrafast` where supported |
| `prompt_cache_key`, `prompt_cache_retention` | Supported | Provider- and model-specific |
| `user` | End-user ID for end-user rate limit policies | Or `X-Phaseo-User-Id` header |
| `metadata` | Custom metadata usable by dynamic routes | Use `X-Phaseo-Metadata` labels for cost slicing |
| `organization` / `project` options, `OpenAI-Organization` / `OpenAI-Project` headers | No equivalent | Remove; use Phaseo workspaces and API keys |
| Assistants and Threads | No equivalent | OpenAI has shut these down; port to `/v1/responses` with client-held history |
| Vector stores, fine-tuning jobs, legacy `/v1/completions` | No path in the Phaseo API reference | Keep these calls on OpenAI or redesign them |
| Fine-tuned `ft:` models | Not covered by the migration docs | Keep on OpenAI unless `GET /v1/models?format=openai` lists them |

## Gotchas

- An explicit `baseURL` wins over `OPENAI_BASE_URL`, but remove stale `OPENAI_BASE_URL` values so other clients in the repo do not keep calling OpenAI.
- Replace `AzureOpenAI` with the plain `OpenAI` client; Azure deployment names and `api-version` parameters do not apply.
- `previous_response_id` and `conversation` return 400 because Phaseo does not store responses. Send the full history in `input`. There is no `GET` or `DELETE /v1/responses/{id}`.
- `client.models.list()` reads `data`, which Phaseo returns only with `format=openai`: pass `{ query: { format: "openai" } }` in Node or `extra_query={"format": "openai"}` in Python.
- Do not keep the OpenAI key in the same variable. Use `PHASEO_API_KEY` so it is clear which platform a key belongs to.
