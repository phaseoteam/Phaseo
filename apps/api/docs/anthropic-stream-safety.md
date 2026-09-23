# Anthropic stream safety

Anthropic and Bedrock Messages streams no longer tee their body into an unread
accounting branch. Usage is observed as the same downstream-consumed stream is
read. The finalizer returns a completed usage snapshot without another read.
Native Messages requests bypass the Responses conversion round trip, preserving
native blocks, signatures, citations and tool identity. This is a semantic
passthrough, not a zero-copy transport: bounded SSE framing is canonicalized and
a missing event name is supplied from the payload for SDK compatibility.

The Anthropic-to-Responses bridge (also used by Vertex) and Anthropic buffered
nonstream path now use the shared pull-driven SSE reader. They validate UTF-8,
CR/LF/CRLF and multiline framing, reject malformed/truncated streams, release
readers on cancellation, and never manufacture successful completion at EOF.
Provider errors preserve credential ownership, including BYOK-neutral auth
failures. Token-limit completion is `response.incomplete`, with typed JSON and
monotonic sequence numbers.

## Memory and billing

- Native usage observation retains no output content or accounting stream copy;
  usage metadata is limited to 64 top-level fields and 16,384 JSON characters.
- Responses compatibility snapshots and nonstream materialization still retain
  output, bounded by four MiB of admitted event-data characters and 128 blocks.
  The current compatibility exception is explicit; this is not a claim of
  satisfying the plan's strict no-full-output-retention goal for translations.
- The translated terminal retains cache-read, cache-write, 5-minute/1-hour cache
  creation and native search usage. Previously the projection omitted several
  of those fields, and its unconsumed fallback accounting tee did not fix that
  when a terminal already contained partial usage.
- Shared parser bounds also apply; these are per-request limits, not proof of
  unlimited safe concurrent streams. The after-stage still drains upstream on
  client disconnect to obtain authoritative usage; provider cancellation policy
  remains a separate plan item.

## Validation

- Existing Anthropic/Bedrock/Vertex and cross-protocol tests pass.
- New fault tests cover one-byte Unicode framing, incomplete/native terminals,
  truncation, invalid JSON, output/index bounds, native metadata preservation,
  usage-copy isolation, cancellation, pricing meters and BYOK attribution.
- Installed Anthropic SDK reconstructs a native tool call and its cache usage.
- Native Workers harness verifies pull-driven consumption, reader release,
  terminal usage, incomplete status, Unicode/CRLF and truncated-stream rejection.
- Full-source and staging gates pending. Poolside probes validate shared gateway
  regressions, not actual paid Anthropic/Bedrock/Vertex provider behavior.
