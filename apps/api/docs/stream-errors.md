# Stream error ownership and native terminals

Stream failures carry a bounded GatewayStreamError with origin, kind, safe code,
status, retry eligibility and health impact. Provider health classification moved
to a pure shared module without changing its routing rules. The stream classifies
once; after-stage billing/health/audit reuse the outcome instead of reparsing it.
BYOK credential/quota failures stay neutral. Gateway transformation and imposed
buffer-capacity errors stay neutral rather than blaming provider reliability.

OpenAI-compatible quirk exceptions are no longer swallowed: they become gateway
errors without retaining the exception's raw message, credentials or payload.

After a successful downstream write, subsequent transport/processing failures
produce one native error and close, not a successful DONE/message_stop. Chat uses
a nested error object; Responses uses the typed error event with the next sequence
number; Messages uses event:error with type:api_error. These synthesized errors
use generic safe messages. Existing explicit native provider error frames retain
their established pass-through behavior. Before commitment, read errors still
propagate to the caller; request-wide pre-commit retry is not implemented here.

The schema follows the installed OpenAI SDK's ResponseErrorEvent and SSE reader,
and [Claude's error contract](https://platform.claude.com/docs/en/api/errors).
The low-level Responses SDK yields an error event for the caller to handle; this
is not a claim that every high-level SDK helper throws on that event.

## Validation

- Deterministic cases cover origin preservation through adapters, corruption vs
  capacity failures, BYOK status mapping, safe error metadata and retry eligibility.
- All three native protocol frames, monotonic Responses error sequencing and
  no-success-sentinel behavior are checked after partial delivery.
- Installed OpenAI Chat and Anthropic SDKs throw on the injected native error;
  the low-level Responses SDK receives the typed error. All calls use mocked
  fetch, not paid providers, and make exactly one upstream request.
- Existing failed-stream tests still require no charge and one failure audit.
  Native Workers commitment, truncation and cancellation tests pass.
- All 599 source files / 4,644 tests pass. Typecheck, scoped lint and staging
  dry-run pass. Live staging evidence will follow deployment. No production change.

Remaining: request-wide retry/financial policy, cancellation usage recovery and
durable settlement. Retry eligibility never authorizes replay after commitment.
