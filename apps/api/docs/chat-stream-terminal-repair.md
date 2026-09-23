# Chat terminal repair

The bounded staging matrix found that the shared OpenAI-compatible Chat adapter
discarded upstream `[DONE]`. HTTP 200 and token delivery therefore did not prove
a complete protocol stream. Preserve the sentinel exactly once; do not invent
success on EOF or forward data after the sentinel. Four deterministic regressions
cover usage, duplicates, every sentinel split point, and incomplete EOF.

This is not the full streaming-session overhaul. Bounded framing, read-error
propagation, cancellation policy and unified financial completion remain pending.

## Live verification

The documented provider endpoint suite has an explicitly gated, bounded Poolside
staging mode. It disables ordinary model discovery and all other live scenarios.
It verifies both routes' zero pricing before creating a 15-minute disposable key,
runs at most twelve requests with sixteen requested output tokens, verifies
protocol termination and zero-cost audit rows, and revokes the key in `finally`.
Only metadata is recorded under `reports/provider-live`; no response payloads,
credentials or environment-file contents are printed.

Set `LIVE_RUN=1`, `LIVE_PROVIDER_ENDPOINT_MATRIX_RUN=1` and
`LIVE_PROVIDER_ENDPOINT_MATRIX_POOLSIDE_STAGING=1`.
`LIVE_PROVIDER_ENDPOINT_MATRIX_OPERATOR_ENV_FILES` is a JSON array of exactly two
absolute local env-file paths containing the authorized operator configuration.
Then run `pnpm --filter @phaseo/gateway-api test:live:provider-endpoint-matrix`.
The target is fixed to staging and the owned disposable test workspace; it cannot
be redirected to production or a paid model through environment overrides.

## Validation limits

The unscoped `pnpm test` also includes environment-dependent integration suites.
The September 23 run had 633 failed tests across 22 files, including missing live
credentials, absent Workers runtime mocks, an AIMock port collision, outdated
executor fixtures, contract assertions and a wall-clock performance assertion.
It is not a passing whole-repository gate. Source regressions and the explicitly
configured staging matrix are reported separately; broader failures remain to be
resolved before treating the overall release gate as green.
