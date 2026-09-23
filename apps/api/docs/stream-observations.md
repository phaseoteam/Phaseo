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

Staging source `889e0be80`, Worker `d6e4ff47-5d3e-4927-ab41-e4aa74b1406c`:
12/12 Poolside XS/S protocol/mode probes passed in LHR, all audits verified zero
cost, disposable key `0ff12554-0a9a-474b-b203-c92867545a8c` revoked. Routing ms:
433, 24, 22, 5, 4, 5, 162, 85, 5, 9, 15, 4. These are not total provider latency.

All twelve sampled operation records completed with zero pending background
tasks. All six streamed records had terminal state COMPLETED, commitment and
final usage; finish reasons correctly separated length (XS) and stop (S).
Observed stream durations: 45, 65, 129, 18, 9, 312 ms. The new first-frame/output
session timings were zero at production timer resolution; do not interpret them
as zero end-to-end latency or CPU. Frame counts match the client's SSE parser.

This traffic still incurs KV reads and background health RPCs, and some cache
writes. Ten follow-up requests had no Supabase **reads or RPCs before dispatch**,
but one had a pre-dispatch advisory mutation. These timestamp buckets include
concurrent background work; they do not prove which operations block dispatch.
No total-cost or global-SLO claim follows from twelve free requests in one colo.
