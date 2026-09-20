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
- Optional schema validation and stream accumulation helpers.
- Explicit catalogue capability validation with useful incompatibility reports.
- Public deterministic test transports and examples; no paid providers in CI.

Use existing room controls/dialogs as the visual source; preserve keyboard and
mobile behavior. No database changes, new provider protocols, or public Realtime
expansion. Tests use local fixtures. Keep generated sources unchanged unless the
public HTTP contract changes; these improvements belong in handwritten layers.

## Validation

Run SDK unit suites, build and package consumption checks; compile exported
examples; run focused web tests, typecheck, lint and browser verification.
