# Bounded SSE framing

The OpenAI-compatible Chat passthrough now uses the shared `readSseEvents`
iterator and a pull-driven output stream. The maintained `eventsource-parser`
3.1.1 package was already resolved transitively in the lockfile; it is now an
explicit API dependency. No other dependency versions changed.

The parser handles LF, CRLF, CR, multiline data, comments, split UTF-8 and BOM.
It does not reconnect or synthesize events from incomplete EOF. Decoding is
strict; malformed UTF-8/JSON, transport failures and missing Chat `[DONE]`
propagate as errors rather than successful adapter closure. `[DONE]` is forwarded
once after usage, and subsequent frames are ignored. Readers are released on
completion, failure and cancellation; pending reads are interruptible.

Feeds are limited to 4,096 bytes; partial/event content to 4 Mi characters; input
chunks to 16 MiB and completed-event batches to 1,024 entries. These are safety
limits, not a claim that every stream's total memory is four MiB: provider
transforms may still retain response/tool state. Unsupported oversized events
fail explicitly; nothing is silently truncated. Only one output chunk is emitted
per pull; parser read-ahead is bounded within the current feed/input chunk.

Validation: 19 focused tests, all 4,556 source tests in 592 files, typecheck,
scoped lint (existing stream-transforms file-length warning) and staging build.
Native workerd verifies byte-split CRLF/UTF-8, no eager source read, cancellation
of a pending read, lock release and oversized-event rejection.

This layer migrates the Chat passthrough only. Responses, protocol bridges,
after-stage framing, session outcomes/commitment, protocol-native error events
and durable settlement remain to be migrated/tested. In particular, the legacy
after-stage can still swallow an adapter error; adapter propagation alone is
not an end-to-end failure guarantee. No production rollout is claimed.
