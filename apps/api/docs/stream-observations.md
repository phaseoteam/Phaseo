# Bounded stream observations

The existing sampled `gateway_operations` record now includes one redacted
stream outcome: terminal state, commitment, delivered frame/byte counts,
disconnect, final-usage availability, normalized first stop reason and error
origin. No generated text, tool arguments, raw usage, exception messages or
provider payloads are copied into this record. Unknown stop reasons become
`other`; no unbounded label is retained. Duplicate completion cannot replace it.

Timing fields are milliseconds from creation of the **post-headers stream session**:

- `firstOutputObservedMs`: first generated output frame observed upstream, before
  rewriting/client backpressure. Null if no output was observed.
- `firstFrameMs`: first successful downstream writer write, including metadata
  frames. This is commitment, not proof of network receipt or first text token.
- `durationMs`: terminal stream outcome, before accounting persistence completes.

These are not end-to-end request TTFT, provider dispatch-to-token timing, CPU
duration or billing settlement latency. The existing request/provider metrics
retain their meanings. Cloudflare production timers advance around I/O, so zero
is a valid observed interval, not proof of free CPU:
https://developers.cloudflare.com/workers/runtime-apis/performance/

No extra KV/DO/Supabase/Cache API calls, timers, retries or log events are added.
The metadata joins the existing sampling policy (100% in the isolated staging
configuration). The local tail sanitizer independently allowlists fields,
enums and finite nonnegative numbers; arbitrary Worker log fields stay hidden.

This is measurement only. Request-wide retry commitment, durable settlement and
executable provider cancellation/usage recovery are still separate plan items.
The lifecycle tests continue to require immediate forwarding, terminal usage,
exactly-once completion and upstream draining after client cancellation.

Local validation: 608 source files / 4,771 tests pass; 191 after-stage tests pass;
native Workers stream-finalization tests and two tail-redaction tests pass.
Type-check, targeted lint and staging dry-run pass. Live evidence follows separately.
