# Responses-to-Messages transport safety

The Messages bridge now uses shared bounded SSE framing and pull-driven output.
It propagates malformed JSON, read errors and truncated EOF instead of emitting
a successful-looking message_stop. Native completion/incomplete/error events
terminate exactly once, with no later upstream frames forwarded.

Responses may interleave parallel tool calls; Anthropic SDK content-block
callbacks expect serial blocks. The bridge forwards the first block immediately
and queues later-block frames until their predecessor ends. Queues are bounded
at 4,096 frames / 8 MiB; block state is bounded at 128 blocks / 512 aliases with
1,024-character identities. Exceeding bounds fails explicitly. Ordinary text is
not accumulated into a response; parallel-protocol conversion has this explicit
bounded buffering exception. Done-only item content precedes block closure.

Provider error codes/status survive translation for correct BYOK/global health
classification. The module remains a protocol adapter, with no storage calls.

## Validation

- 595 source files / 4,610 tests pass. Fourteen new tests cover framing,
  cancellation, backpressure, transport failures, bounds and terminal behaviour.
- The installed Anthropic SDK consumes mocked interleaved tool calls and
  reconstructs both finalMessage and contentBlock callbacks correctly.
- Gateway typecheck passes; scoped ESLint has no errors (existing large-test
  warning); staging dry-run passes.
- Native Workers harness passes all three migrated bridge directions including
  blocked-read cancellation and reader release.
- Live evidence will follow staging deployment. Production is unchanged; the
  complete lifecycle/settlement plan and other native provider parsers remain.
