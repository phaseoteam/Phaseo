# Native terminal finalization

The after-stage now uses the bounded SSE reader, with chunk-arrival timestamps
preserved independently of downstream writes. Chat `finish_reason` and trailing
usage are provisional until `[DONE]`; Responses completed/incomplete/failed and
Messages stop/error events finish their respective wire protocols. Existing
full Chat completion snapshots remain supported as terminal compatibility data.

Final usage is dispatched once after the native terminal has been forwarded.
Late events cannot replace the settled usage. Incomplete EOF, malformed frames,
upstream read errors and gateway callback errors abort the readable stream rather
than masquerading as successful closure. Source reader locks are released.
Client disconnect still drains upstream for exact usage; cancellation policy is
not loosened here. Async accounting does not block response completion, and sync
callback throws are contained in the background finalization promise.

Failure origin is explicit for the after-stage: provider framing/read failures
affect health, but local transform/observer errors remain gateway-attributed and
health-neutral. Native Chat error envelopes are recognized without requiring an
`object` discriminator. Native credential/quota status and BYOK ownership reach
the health classifier, preserving shared-provider neutrality for BYOK 4xx errors.
The existing failed-response charging policy is unchanged.

Validation: 172 focused after/health tests and all 4,567 source tests in 592
files; typecheck, scoped lint and staging build pass. Native workerd covers
terminal usage, failure after usage but before the marker, gateway transform
failure, exactly-once finalization and released readers.

Remaining: request-wide StreamSession/commit/retry integration, remaining eager
protocol bridges, protocol-native postcommit error events, shared nonstreaming
execution, durable idempotent settlement and production evidence gates. Stream
abort is now observable, but is not yet the planned protocol-native error frame.
