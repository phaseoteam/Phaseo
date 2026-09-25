# Streaming attempt policy

This increment follows the September 25 review of the native routing stack.
It builds on the existing caches, protocol bridges and StreamSession rather
than replacing them. The stack was reconciled with main `e244fae8c`, retaining
main's audit JSON normalization and applied-migration history marker.

## Buffered transport parity

The client-facing text surface preserves the requested streaming mode. Each
provider attempt decides whether a buffered request can use streaming transport
from that provider-model-capability's authoritative `params.stream` descriptor:

```json
{
  "stream": {
    "supported": true,
    "bufferedParity": true,
    "preferStreamingForBufferedRequests": true
  }
}
```

All three values must be boolean `true`. Absent, legacy, malformed or explicitly
disabled metadata preserves native non-streaming. Client-requested streaming
is unchanged; this optimization does not redefine streaming eligibility.
The decision is per attempt, so fallback does not inherit the previous provider's
transport choice. Request payloads cannot supply this trusted descriptor.

Compatibility evidence belongs to the database control plane, not a hard-coded
provider allowlist. Declaring parity requires coverage of the route's supported
tools, structured output, reasoning, cache usage, service tiers and extensions,
not merely one successful text probe. This code change does not publish new
parity declarations or alter production capability rows.

The existing bounded materializer handles opt-in streams; native JSON results
continue through the existing completed-result path. This change adds no cache,
network lookup, timer or coordination operation to select the transport.

## Local verification

On the reconciled stack, all 616 source test files / 4,887 tests pass, along with
TypeScript and the original staging Worker dry-run. Targeted lint has no errors
(four file-length warnings). Tests exercise strict declaration validation,
client-payload isolation and per-attempt fallback transport selection.

Existing native Workers fixtures also pass for bounded materialization,
stream terminal/usage/cancellation finalization, public context composition and
concurrent settlement. The local PostgreSQL fixture passes workspace schema,
role/tenant/key isolation, admission and migration-idempotence checks. One main
catalogue test fixture was corrected to retain route metadata; production
catalogue behavior and its existing assertions are unchanged.

## Remaining rollout gates

Pre-commit stream fallback, executable cancellation with exact-usage recovery,
durable mutation publication and settlement recovery remain distinct requirements.
Unknown cancellation semantics continue to drain upstream. Representative cost,
fault and regional evidence must precede production rollout; legacy paths are
removed only after production verification. No new queue, schedule, wallet edit
or production deployment is authorized by this implementation document.
