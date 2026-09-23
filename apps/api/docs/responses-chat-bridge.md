# Bounded Responses-to-Chat bridge

The bridge now uses the shared SSE reader and pull-driven output. It handles
split UTF-8, CRLF and payload-only Responses event types without a separate
unbounded string buffer. Malformed JSON, read failures, missing native terminals,
argument-prefix drift and conflicting tool aliases propagate as failures.

Tool calls announce ID and name once. Argument deltas are incremental; repeated
done/item snapshots emit only an unseen suffix. Append-based clients therefore
reconstruct the original function call instead of repeated names/arguments.
Retained tool state is capped at 128 calls, 512 aliases, 1,024-character names/IDs
and 4 Mi characters of arguments, in addition to the shared framing bounds.

The existing full Chat completion compatibility snapshot is retained. The
after-stage now terminates that snapshot with exactly one Chat `[DONE]` marker,
without forwarding later upstream frames or settling usage twice. This is not
the final request-wide StreamSession or protocol-native error architecture.

## Validation

- 593 source test files / 4,583 tests pass (`vitest run src --maxWorkers=4`).
- Gateway typecheck passes; scoped ESLint has no errors (existing file-size
  warnings); staging Worker dry-run passes.
- Native Workers harness `node scripts/test-responses-chat-bridge.workerd.mjs`
  passes split UTF-8/CRLF, no eager read, blocked-read cancellation, released
  readers and truncated-stream rejection.
- Fifteen focused bridge cases include append-style tool reconstruction, alias
  collision, state bounds, incomplete/failure terminals and after-stage usage.

Poolside live evidence will be recorded after deployment. Free Poolside probes
do not establish every provider's Responses-wire compatibility or paid billing
durability. Production is unchanged.
