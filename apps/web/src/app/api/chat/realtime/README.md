# Realtime Voice Billing Contract

This route is an experimental chat-facing proxy for gateway-backed realtime
voice sessions. Chat and public API clients share the same durable session,
reservation, usage snapshot, hold extension, and final settlement path.

## Session Contract

1. Chat and API clients create sessions through `POST /v1/realtime/sessions`.
2. The gateway authenticates the API key or managed chat key.
3. The gateway verifies the model supports `audio.realtime` and has pricing.
4. The gateway creates a durable `gateway_realtime_sessions` row.
5. The gateway reserves an initial `$5.00` wallet hold.
6. The gateway mints a short-lived provider token only after the hold succeeds.
7. The client connects with the ephemeral token and displays live estimated cost.
8. The gateway records usage snapshots and provider final usage events.
9. The gateway captures final cost and releases unused reservation on finalize.

## Usage Meters

Realtime settlement accepts both token and duration usage. The pricing card
chooses which meters are billable.

- OpenAI realtime: token-priced with text/audio input, cached input, and output
  token meters.
- xAI realtime: duration-priced with `audio_minutes`, plus optional
  `input_text_messages`.
- Google Live: token-priced; gateway snapshots may derive audio tokens from
  duration using Google's documented 25 audio tokens per second when provider
  metadata is not available.

Clients may send `input_audio_ms`, `output_audio_ms`, `audio_ms`, seconds, or
minutes. The gateway normalizes these to `input_audio_seconds`,
`output_audio_seconds`, `audio_seconds`, and the corresponding minute meters
before pricing.

## No-Cost Verification

Run the local billing replay before any live provider test:

```bash
pnpm --filter @ai-stats/gateway-api exec vitest run src/core/realtime-sessions.billing.test.ts
```

This is the closest no-cost equivalent to a live billing test. It feeds
live-shaped OpenAI, xAI, and Google realtime usage payloads through the real
gateway usage normalizer and pricing engine, then asserts final nanos and line
items. It does not mint provider tokens, open WebRTC/WebSocket connections,
call Supabase, or spend credits.

Coverage:

- OpenAI: authoritative `response.done.usage` token billing with cached input
  separated.
- xAI: streamed audio duration billed via `audio_minutes`, plus optional text
  message billing.
- Google Live: text tokens plus output audio duration converted to audio tokens
  using the documented 25 tokens/second fallback.

## Hold Policy

- Initial hold: `$5.00`.
- Extension threshold: `80%` of the currently reserved amount.
- Graceful stop threshold: `95%` of the currently reserved amount.
- If extension succeeds, the session continues with a larger reservation.
- If extension fails or available credits are exhausted, the gateway asks the
  model to give a short closing message and then closes the realtime transport.
- Final capture must use provider/gateway usage, not the browser estimate.

## Graceful Stop

The client can make the ending feel good, but it cannot enforce billing. The
gateway should own the final shutdown sequence:

1. Pause or stop accepting new microphone frames.
2. Inject a provider-specific control message:
   `The realtime session budget is almost exhausted. Briefly tell the user that this voice session is ending, finish the current thought, and do not ask a follow-up question.`
3. Allow a short drain window, for example 8 seconds.
4. Close the provider connection.
5. Finalize the session idempotently.

## Persistence

Production should add a realtime session table with:

- `session_id`
- `workspace_id`
- `key_id`
- `user_id`
- `source` (`chat` or `api`)
- `provider`
- `model_id`
- `voice`
- `status`
- `started_at`, `connected_at`, `ended_at`, `expires_at`
- `reservation_id`
- `reserved_nanos`, `captured_nanos`, `released_nanos`
- `usage`
- `pricing_lines`
- `estimated_cost_nanos`
- `final_cost_nanos` computed by gateway settlement
- provider-native session/response IDs
- disconnect/error reason

The existing wallet reservation RPCs are the right settlement primitive:
`gateway_wallet_reserve_once`, `gateway_wallet_capture_once`, and
`gateway_wallet_release_once`.

## Current Gap

Billing settlement and provider transport are gateway-owned for public chat
sessions. Browser clients receive a relay connection and cannot submit final
cost overrides; the gateway computes final settlement from provider usage
meters and server-observed audio duration where the provider bills by time.
