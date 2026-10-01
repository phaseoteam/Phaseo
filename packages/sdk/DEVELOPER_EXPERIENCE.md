# SDK developer experience

Developers should be able to move from a Phaseo room to working application code,
switch compatible models, and diagnose failures without rebuilding transport and
job orchestration. Preserve existing resource methods and generated contracts.

## Acceptance criteria

- Shared request controls, actionable errors and metadata across JSON, streams,
  and media. Retry safe reads only; paid submissions are never automatically retried.
- Native async Python resources, streaming, job waiting and deterministic cleanup.
- Runnable TypeScript/Python room exports and request trace links.
- Resumable media jobs, streamed downloads and batch result helpers.
- Native offset pagination that stops on `has_more: false`, empty pages, or a
  non-advancing response, plus resumable job handles in every gateway SDK.
- Optional schema validation and stream accumulation helpers.
- Full-request preflight against live model-route capabilities, with structural
  prompt fields excluded and unsupported or invalid generation parameters highlighted.
- Public deterministic test transports and examples; no paid providers in CI.

## Shared core contract

Every gateway SDK exposes the same transport concepts in the idioms of its
language: request-scoped timeouts and headers, safe retries for GET and HEAD,
idempotency keys, request/response/retry hooks, raw response metadata, and
structured HTTP errors. POST and other write requests are not retried
automatically, even when an idempotency key is supplied.

Generated operations and public escape hatches must use the same transport
pipeline. The machine-readable contract lives in `core-contract.json`; run
`pnpm validate:sdk-contract` after changing a generator or SDK transport.

Use existing room controls/dialogs as the visual source; preserve keyboard and
mobile behavior. No database changes, new provider protocols, or public Realtime
expansion. Tests use local fixtures. Change generated sources through their
OpenAPI backend and regenerate them; never patch generated output directly.

## Validation

Run SDK unit suites, build and package consumption checks; compile exported
examples; run focused web tests, typecheck, lint and browser verification.
