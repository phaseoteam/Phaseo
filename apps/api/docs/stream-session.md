# Shared stream lifecycle

The existing priced stream pump now owns a StreamSession: PRE_COMMIT becomes
STREAMING only after a downstream write succeeds. Exactly one completion promise
resolves to COMPLETED, FAILED or CANCELLED; late transitions cannot alter it.
Health, billing and audit consume that same outcome through onCompletion.
Legacy onFinalUsage remains a compatibility observer of the same promise.

Delivery cancellation and accounting finality are distinct. Disconnect marks
delivery stopped but keeps draining upstream for authoritative usage. A later
upstream failure takes precedence over cancellation; otherwise CANCELLED retains
the completed usage and existing charging policy. Native provider error terminals
are FAILED even when framing completed successfully. Consumer failures cannot
rewrite the outcome or prevent another registered observer from executing.

The session retains counters and usage, not generated output, and performs no
external operations. This is the plan's lifecycle wrapper stage: pre-commit
provider retry, structured error encoding and durable settlement remain separate
work. The existing best-effort background finalizer is not crash-durable.

## Validation

- Fifteen new tests cover transitions, commitment, duplicate completion, late
  events, failure precedence, cancellation with usage and consumer isolation.
- Existing 24 streaming tests pass without changing their billing assertions.
- Native Workers tests cover terminal usage, truncation, gateway mapping failure,
  delivery commitment and cancellation with recovered usage.
- All 596 source files / 4,625 tests, typecheck, scoped lint and staging dry-run
  pass. Live staging results will follow deployment. Production is unchanged.
