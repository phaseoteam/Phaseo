# Live Integration Test Suites

## Text Modern Feature Matrix

This suite validates modern text-generation behavior across providers:

- Streaming text (`/chat/completions`, `/responses`, `/messages`)
- Native tool calling (OpenAI and Anthropic tool shapes)
- Structured outputs (`json_schema`)
- Reasoning parameter pass-through
- Internal datetime server tool (streaming)

Run it with:

```bash
pnpm --filter @phaseo/gateway-api test:live:text-modern
```

Required environment:

- `LIVE_RUN=1`
- `LIVE_TEXT_MODERN_RUN=1`
- `GATEWAY_API_KEY` (or compatible gateway auth envs already used by tests)

Useful optional environment:

- `LIVE_TEXT_MODERN_PROVIDERS=openai,google-ai-studio,minimax`
- `LIVE_TEXT_MODERN_SCENARIOS=chat_stream_text,responses_stream_tool`
- `LIVE_TEXT_MODERN_MODEL_OVERRIDES=openai=openai/gpt-5-nano`
- `LIVE_TEXT_MODERN_ALLOW_UNSUPPORTED=1` (default)
- `LIVE_TEXT_MODERN_ALLOW_TRANSIENT_FAILURES=1` (default)

Results are written to:

- `apps/api/reports/provider-live/text-modern-features.json`

## Targeted Supported-Surface Suites

These suites track the currently intended supported gateway surface:

- `/responses`
- `/chat/completions`
- `/messages`
- `/embeddings`
- `/moderations`
- `/rerank`
- `/audio/speech`
- `/audio/transcriptions`
- `/audio/translations`
- `/images/generations`
- `/videos`
- `/files`
- `/batches`

You can run these suites one at a time with their dedicated scripts, or use the targeted runner to select only the suites you still care about:

```bash
pnpm --filter @phaseo/gateway-api test:live:targeted -- --list
pnpm --filter @phaseo/gateway-api test:live:targeted -- --suite gpt54-nano-text
pnpm --filter @phaseo/gateway-api test:live:targeted -- --suite embeddings-moderation,audio-images
pnpm --filter @phaseo/gateway-api test:live:targeted -- --from deepseek-v4-flash
```

That means if `gpt54-nano-text` already passed, you can just start from `embeddings-moderation` or name the remaining suites explicitly, instead of rerunning the earlier ones.

### GPT-5.4 Nano Text Surfaces

Focused compatibility coverage for `openai/gpt-5.4-nano` across:

- `/responses`
- `/chat/completions`
- `/messages`

Each surface covers:

- non-stream text
- stream text
- non-stream tool calling
- stream tool calling
- non-stream structured output
- stream structured output

Run it with:

```bash
pnpm --filter @phaseo/gateway-api test:live:gpt54-nano-text
```

Required environment:

- `LIVE_RUN=1`
- `LIVE_GPT54_NANO_TEXT_RUN=1`
- `GATEWAY_API_KEY`

### DeepSeek v4 Flash Provider Sweep

Provider-pinned `/responses` coverage for `deepseek/deepseek-v4-flash`, using whichever active providers are currently exposed in `/models`.

Run it with:

```bash
pnpm --filter @phaseo/gateway-api test:live:deepseek-v4-flash
```

Required environment:

- `LIVE_RUN=1`
- `LIVE_DEEPSEEK_V4_FLASH_RUN=1`
- `GATEWAY_API_KEY`

### Embeddings and Moderation

Focused coverage for:

- `openai/omni-moderation`
- `google/gemini-embedding-2`
- multimodal embeddings with Gemini Embedding 2

This suite asserts returned usage and pricing for the embedding and moderation paths.

Run it with:

```bash
pnpm --filter @phaseo/gateway-api test:live:embeddings-moderation
```

Required environment:

- `LIVE_RUN=1`
- `LIVE_EMBEDDINGS_MODERATION_RUN=1`
- `GATEWAY_API_KEY`

### Audio and Images

Focused coverage for:

- Xiaomi `mimo-v2.5-tts`
- OpenAI `gpt-4o-mini-transcribe`
- `/audio/translations` on the first available OpenAI translation-capable model
- OpenAI `gpt-image-1-mini`

Run it with:

```bash
pnpm --filter @phaseo/gateway-api test:live:audio-images
```

Required environment:

- `LIVE_RUN=1`
- `LIVE_AUDIO_IMAGES_RUN=1`
- `GATEWAY_API_KEY`

### Video and Batch

Heavy async coverage for:

- Google `veo-3.1-lite` at low settings
- OpenAI batch upload, create, poll, and output retrieval flow

Run it with:

```bash
pnpm --filter @phaseo/gateway-api test:live:video-batch
```

Required environment:

- `LIVE_RUN=1`
- `LIVE_VIDEO_BATCH_RUN=1`
- `GATEWAY_API_KEY`

Useful optional environment:

- `LIVE_VIDEO_BATCH_VIDEO_POLL_ATTEMPTS`
- `LIVE_VIDEO_BATCH_VIDEO_POLL_DELAY_MS`
- `LIVE_VIDEO_BATCH_BATCH_POLL_ATTEMPTS`
- `LIVE_VIDEO_BATCH_BATCH_POLL_DELAY_MS`
- `LIVE_VIDEO_BATCH_BATCH_REQUEST_COUNT`

## Native Batch Provider Matrix

This suite runs one minimal text batch independently against OpenAI, Gemini, Anthropic, xAI, and Mistral. It is disabled unless both live flags are set, so collecting the suite cannot create provider spend.

Each provider suite verifies:

- the gateway returns a public batch ID and persists the native provider ID
- a positive wallet reservation exists after creation
- reconciliation reaches normalized `completed` state and records `billed_at`
- authoritative cost exactly matches `settled_amount_nanos`
- the reservation reaches `captured`
- completed request rows are available through `/batches/:id/requests`
- a managed `batch.completed` webhook arrives with a stable event ID and valid HMAC signature

The harness creates one temporary managed webhook endpoint backed by webhook.site and marks it deleted in `afterAll`. Provider batches and billing records are intentionally retained as audit evidence.

Required environment:

- `LIVE_RUN=1`
- `LIVE_BATCH_PROVIDER_MATRIX_RUN=1`
- `GATEWAY_URL=https://api.phaseo.app/v1`
- `GATEWAY_API_KEY` for a workspace in the Statsig Batch API admin segment
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY` matching the deployed Worker secret

Run all five sequentially:

```bash
pnpm --filter @phaseo/gateway-api test:live:batch-providers
```

Run one provider first:

```bash
LIVE_BATCH_PROVIDER_MATRIX_PROVIDERS=openai pnpm --filter @phaseo/gateway-api test:live:batch-providers
```

Provider IDs are `openai`, `google-ai-studio`, `anthropic`, `x-ai`, and `mistral`. On PowerShell, set the variable first with `$env:LIVE_BATCH_PROVIDER_MATRIX_PROVIDERS = "openai"`.

Useful optional environment:

- `LIVE_BATCH_PROVIDER_MATRIX_REQUEST_COUNT=1`
- `LIVE_BATCH_PROVIDER_MATRIX_DB_POLL_ATTEMPTS=90`
- `LIVE_BATCH_PROVIDER_MATRIX_DB_POLL_DELAY_MS=30000`
- `LIVE_BATCH_PROVIDER_MATRIX_WEBHOOK_POLL_ATTEMPTS=30`
- `LIVE_BATCH_PROVIDER_MATRIX_WEBHOOK_POLL_DELAY_MS=5000`
- `LIVE_BATCH_PROVIDER_MATRIX_VERIFY_WEBHOOK=0` to skip the webhook.site assertion when that service is unavailable
- `LIVE_BATCH_PROVIDER_MATRIX_OPENAI_MODEL=openai/gpt-5.4-nano`
- `LIVE_BATCH_PROVIDER_MATRIX_GEMINI_MODEL=google/gemini-2.5-flash-lite`
- `LIVE_BATCH_PROVIDER_MATRIX_ANTHROPIC_MODEL=anthropic/claude-haiku-4.5`
- `LIVE_BATCH_PROVIDER_MATRIX_XAI_MODEL=spacex-ai/grok-4.3`
- `LIVE_BATCH_PROVIDER_MATRIX_MISTRAL_MODEL=mistral/mistral-small-4`

Deploy the Worker and confirm the Statsig admin gate before enabling the live flags. Start with OpenAI, inspect its reservation and webhook result, then run the remaining providers individually before running the complete matrix.

## Provider Endpoint Matrix

This suite discovers active provider/model capability pairs from `/models`, picks a low-cost model candidate for each provider + supported data-plane surface, and exercises one minimal valid request per surface.

Covered HTTP surfaces:

- `/responses`
- `/chat/completions`
- `/messages`
- `/embeddings`
- `/moderations`
- `/rerank`
- `/audio/speech`
- `/audio/transcriptions`
- `/audio/translations`
- `/images/generations`
- `/videos`

`/files` and `/batches` are intentionally covered by the dedicated `video-batch` suite instead of the provider matrix.

Run it with:

```bash
pnpm --filter @phaseo/gateway-api test:live:provider-endpoint-matrix
```

Required environment:

- `LIVE_RUN=1`
- `LIVE_PROVIDER_ENDPOINT_MATRIX_RUN=1`
- `GATEWAY_API_KEY` (or compatible gateway auth envs already used by tests)

Useful optional environment:

- `LIVE_PROVIDER_ENDPOINT_MATRIX_PROVIDERS=openai,google-ai-studio`
- `LIVE_PROVIDER_ENDPOINT_MATRIX_SURFACES=responses_text,image_generations,audio_speech`
- `LIVE_PROVIDER_ENDPOINT_MATRIX_MODEL_OVERRIDES=openai.audio_speech=openai/gpt-4o-mini-tts`
- `LIVE_PROVIDER_ENDPOINT_MATRIX_INCLUDE_HEAVY=1`
- `LIVE_PROVIDER_ENDPOINT_MATRIX_RESULTS_PATH=apps/api/reports/provider-live/provider-endpoint-matrix.json`

Results are written to:

- `apps/api/reports/provider-live/provider-endpoint-matrix-<timestamp>.json`

## Broadcast Destinations

`broadcast-destinations.live.spec.ts` sends four realistic gateway events through the Broadcast queue consumer to each configured destination, then reads back what was stored. Only Supabase and the queue are faked; payload rendering, batching, signing and the HTTP requests are the production code. The four events are:

- a chat completion with trace metadata;
- a streamed tool call in the same trace;
- a request too large for one row;
- a rate-limited request.

Each destination is tested twice: once with every option on, and once with privacy mode on and the cost and identity groups off.

It checks:

- delivery and the health result;
- the row columns;
- prompt content, cost and identity fields present or absent per the destination's settings;
- `metadata.trace_id`, `parent_span_id` and `trace_name`;
- the error span;
- the 512 KB row cap and the 64,000-character OTLP attribute cap;
- webhook signatures, using the verification code from the docs;
- what a resent batch writes.

A fault server also checks which HTTP statuses are retried, and that `Retry-After` sets the delay.

Run everything that works on one machine:

```bash
OTELCOL=path/to/otelcol VERSITYGW=path/to/versitygw pnpm --filter @phaseo/gateway-api test:live:broadcast [destinations.json]
```

- `otelcol` is the [OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector-releases/releases) core build.
- `versitygw` is the [Versity S3 gateway](https://github.com/versity/versitygw/releases), which checks request signatures.
- Either can be left unset to skip its destinations.
- The report is written to `$BROADCAST_SMOKE_DIR/out/report.txt`.

`destinations.json` adds real destinations. Keep it outside the repo:

```json
{ "destinations": [
  { "name": "r2", "type": "r2", "config": { "account_id": "…", "bucket": "phaseo-smoke", "access_key_id": "…", "secret_access_key": "…" } },
  { "name": "clickhouse", "type": "clickhouse", "config": { "endpoint": "https://….clickhouse.cloud:8443", "username": "default", "password": "…", "table": "phaseo_traces" } },
  { "name": "langfuse", "type": "langfuse", "config": { "…": "…" } }
] }
```

`config` takes the same keys as `POST /observability/destinations` (see the "Config keys by type" table in the docs). Rows written to object storage, ClickHouse and Snowflake are deleted afterwards; set `"cleanup": false` to keep them. BigQuery can't delete streamed rows for up to 90 minutes, so the report names the run ID to delete later.

Readback uses the destination's own credentials, so give the test accounts these permissions on top of what Broadcast needs:

| Type | Readback and cleanup permissions |
| --- | --- |
| `s3` | `s3:GetObject`, `s3:ListBucket`, `s3:DeleteObject` |
| `r2` | An "Object Read & Write" token for the bucket |
| `gcs` | An HMAC key for a service account with Storage Object Admin on the bucket |
| `clickhouse` | `SELECT` and `ALTER DELETE` on the table |
| `bigquery` | BigQuery Job User on the project, as well as Data Editor on the dataset |
| `snowflake` | `SELECT` and `DELETE` on the table |

OpenTelemetry vendors have no readback. The report names each run's trace (`smoke <run>-<name>-<variant>`) so you can find it in the vendor's UI.
