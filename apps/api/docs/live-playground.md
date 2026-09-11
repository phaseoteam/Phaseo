# GPT Live playground

GPT Live 1 is available in the existing Realtime room behind the realtime voice feature gate. This integration uses OpenAI's primary Live WebSocket, 24 kHz PCM16 audio, and managed Responses delegation. All 22 built-in voices and GPT 5.6 Luna/Terra backends are supported. Recording storage is disabled.

## Controls

The voice selector includes Alloy, Ash, Ballad, Beacon, Bossa, Cedar, Cinder, Coral, Delta, Echo, Gleam, Marin, Meridian, Quartz, Ripple, Sage, Shimmer, Stone, Tempo, Verse, Vesper, and Willow. Custom voice IDs are not exposed: the playground has no custom-voice authorization flow.

Settings include separate conversation/backend instructions, backend reasoning effort (model default, none, low, medium, high, xhigh), reasoning summary (off, auto, concise, detailed), text verbosity, output limit (16–32,768; default 4,096), default/flex/priority service tier, optional web search, tool choice, and parallel tool calls. Changes apply to the next session; the relay does not accept arbitrary browser `session.update` commands or model overrides. Voice/audio cannot change after provider startup. The output ceiling is a playground spending limit, not the provider's maximum. `max` reasoning is excluded because it is not in the Live schema despite being supported by the standalone backend.

Managed Responses delegation runs backend requests automatically. The default conversation prompt describes the selected capabilities and when to delegate. Custom prompts can control personality, interruptions, backchannels, and delegation. No unsupported temperature, speed, or VAD parameters are sent. Client delegation and custom functions remain disabled because they require application-owned execution, permissions, and tool-result continuation. Web search uses OpenAI's managed tool.

## API flow

1. The authenticated browser creates a session through `POST /api/chat/live/session` on the web API, including `provider`, `model`, `voice`, `instructions`, `backend_model`, and optional `backend_settings`. The gateway strictly validates settings; nested tools, model overrides, pricing, and unknown fields are rejected.
2. The web API attaches the user's trusted Chat identity and calls `POST /v1/live/sessions` on the gateway. Ordinary API keys cannot impersonate a Chat user. Both the voice model and backend must pass workspace policy; the backend must be routable through OpenAI.
3. The gateway snapshots pricing, reserves the existing $5 wallet hold, and returns a one-use relay credential for `/v1/live/sessions/:sessionId/relay`. The existing `REALTIME_RELAY` Durable Object owns the upstream connection to `wss://api.openai.com/v1/live/sessions`.
4. The browser sends validated PCM in `client.audio` messages after `session.started`. The gateway forwards Live events for speech and transcripts and emits `relay.live_usage` with server-computed component costs.
5. Stop sends `client.close`; a browser disconnect also initiates `session.close`. The relay drains provider events for up to 20 seconds. The browser reads persisted billing through `GET /api/chat/live/session/:sessionId`.

The ordinary Realtime create endpoint rejects GPT Live. No public model-discovery capability, OpenAPI contract, SDK surface, database catalog entry, new Worker binding, or database migration is introduced for Live. Deployment requires the gateway, web API, and web app changes together. Existing `OPENAI_API_KEY`, Chat authentication, wallet RPCs, and realtime reconciliation are reused.

## Billing

- Voice uses the published $0.05/minute rate, metered per second. Its versioned price card is snapshotted in session metadata. Primary WebSocket sessions do not receive a WebRTC initialization surcharge.
- Backend pricing comes from active OpenAI `text.generate` catalog price cards. Startup requires standard and requested-tier prices for uncached input, cached reads, cache writes, and output. Missing pricing prevents session creation before any provider call. Each response uses its returned service tier (the requested tier if omitted); unknown tiers or model mismatches retain the hold. Tier rules are isolated so missing or unmatched prices cannot fall back to another tier. `auto` is excluded to avoid unpredictable project-tier selection.
- `session.usage.updated.usage.seconds` is cumulative; it replaces the previous duration. `session.closed` supplies the final duration.
- Each nested Responses terminal event is billed separately by response ID, including partial/failed responses with usage. Cache reads and writes are removed from uncached input. Output already includes reasoning. Per-response pricing preserves context thresholds.
- Track `session.delegation.created.delegation.response_id` and `delegation.id`, then the outer `response.event.delegation_id` and nested response lifecycle. The nested ID is required before a closed voice session can settle. Continued backend responses are priced separately even under the same delegation.
- Web search costs $0.01 per tool call, with search-content tokens included in backend usage and charged at model rates. A versioned tool price card is snapshotted at startup. Native `web_search_call` items are tracked from nested `response.output_item.added`/`done` events, deduplicated by item ID and linked to response/delegation IDs. Terminal `response.output` is deliberately empty and must not be used to count tool calls. Missing completions and unexpected tools retain the hold.
- Provider response IDs, the complete provider usage object, model, tier, and normalized usage are stored together in durable checkpoints. Repeated identical terminal events and settlement retries do not duplicate charges; contradictory usage fails closed. Reasoning counts are retained for display but not charged twice. Pricing lines retain the component, model, response/delegation/tool IDs, meters, and nanodollar costs. The authenticated billing read returns this usage, and the room shows totals plus per-response status.
- The existing wallet settlement RPC captures voice plus backend charges atomically and releases unused credit. A client cannot supply usage or costs. A missing final event, missing backend usage, malformed usage, or an unpriced meter retains the hold as `billing_unresolved` for reconciliation/review; elapsed browser time never substitutes for provider usage.

Backend price cards must already be present and active in the database. No paid provider calls are required by the tests. Unknown Live privacy eligibility cannot inherit the backend's ZDR eligibility.

## Local verification

Run the `live-sessions` tests plus the existing `realtime-*` billing/lifecycle tests in `apps/api`, and `chat.realtime.test.ts` / `chat.test.ts` in `apps/web-api`. They use mocked provider traffic and wallet persistence. Type-check all three applications and build the web app and both Worker dry-runs. Do not run provider live tests to validate this feature by default.

Official contracts (checked 2026-09-10): [model and pricing](https://developers.openai.com/api/docs/models/gpt-live-1), [Live schema](https://developers.openai.com/api/reference/resources/live), [primary WebSocket](https://developers.openai.com/api/reference/resources/live/primary-websocket), [delegation](https://developers.openai.com/api/docs/guides/live-delegation), [tool and tier pricing](https://developers.openai.com/api/docs/pricing).
