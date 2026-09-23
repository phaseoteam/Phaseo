# Bounded text materialization

Existing upstream-streamed, downstream-JSON text routes now use the same bounded
SSE reader as streaming adapters. They require a fully framed Chat `[DONE]` or a
native Responses completed/incomplete terminal; a finish reason, created event,
partial JSON frame or EOF is not proof of completion. Provider errors fail the
request with credential ownership retained. No provider was newly switched to
upstream streaming by this change.

Ordinary JSON fallback remains supported, including mislabelled text/plain
responses. Only a bounded prefix is inspected to detect it, and replayed without
losing bytes. JSON fallback is capped at 16 MiB; streamed materialization at
16 MiB of admitted event-data characters; shared SSE frame/chunk limits also
apply. Chat choice/tool indices must be integers from 0 through 127. Readers are
cancelled/released on failure or early completion.

Final usage arriving after Chat finish_reason is included before `[DONE]`.
Fully framed late tool IDs and native Responses incomplete results remain valid.
The known empty-DONE `length` policy remains available only with a fully framed
sentinel. Old tests that accepted unframed EOF as success now explicitly assert
rejection, with replacement tests for valid late-tool and final-usage behavior.
This intentionally removes false-success behavior for truncated responses.

Validation: 604 source test files / 4,701 tests pass; typecheck, focused lint and
Worker dry-run pass. Native Workers tests cover one-byte Unicode/CRLF, final
usage, JSON fallback, truncated-output rejection and source-reader release.
Deployed commit `4010e57a4` to staging Worker version
`02edb664-9f74-4d10-b180-132739a8ceff`. All twelve free Poolside checks across
Chat/Responses/Messages and both streaming modes passed with zero-charge audits;
the disposable key was revoked. Routing overhead was 388 ms for the first request
and 4–124 ms for the remaining requests in LHR (not a global latency guarantee).
Provider parity declarations, retries before client
commitment, remaining native parsers and durable settlement remain plan items.
