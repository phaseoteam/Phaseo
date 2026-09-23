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

Staging source `689199433`, version `ade79ae2-3bda-450a-b92e-ceb2b03339c2`:
all twelve free Poolside XS/S protocol cases and successful zero-charge audits
passed; disposable key `98c80e36-1d32-427e-9702-8592b6bb9b05` revoked. LHR
routing: 695, 79, 40, 9, 5, 8, 109, 32, 11, 10, 6, 17 ms. These are healthy
staging protocol checks, not global fault/latency or paid-accounting evidence.
