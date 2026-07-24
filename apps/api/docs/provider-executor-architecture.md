# Provider executor architecture

Every upstream provider must have an explicit capability executor registration.
Being compatible with an OpenAI wire format is not sufficient reason to route a
provider through a generic fallback executor.

## Ownership boundary

Provider-owned code lives under:

```text
src/executors/<provider>/<capability>/index.ts
```

That entry point owns provider policy, including:

- supported upstream route;
- retry and responses-to-chat fallback policy;
- request preprocessing and provider quirks;
- endpoint/header/key configuration selected for that provider;
- postprocessing and provider-specific stream transformations.

Shared modules may implement protocol mechanics that must remain identical:

- IR to OpenAI Responses/Chat wire conversion;
- SSE parsing and protocol conversion;
- bounded error-payload parsing;
- usage normalization;
- common executor result types.

Shared protocol modules must not decide which provider is executing. In
particular, provider lists and provider-ID conditionals for route or retry
selection belong in provider executors.

## Resolution rule

`resolveProviderExecutor(providerId, capability)` only returns explicitly
registered executors. There is no generic text-generation fallback for entries
in the OpenAI-wire configuration registry. A coverage test requires every
configured OpenAI-wire text provider to appear in `EXECUTORS_BY_PROVIDER`.

## Cloudflare Workers timing contract

Every executor records timestamps at
the same boundaries using `performance.now()` for durations and `Date.now()`
only when an absolute timestamp is required for persisted telemetry:

1. executor entered;
2. immediately before the first model-provider `fetch()`;
3. immediately before every later retry or fallback `fetch()`;
4. upstream headers received;
5. first response byte/event observed;
6. stream or buffered response completed.

Timing state is request-local and passed through executor arguments/results. It
must never be stored in mutable module scope. Background telemetry persistence
must be attached to the Worker execution context through `waitUntil`.

Authentication, token-count preflights, remote media downloads, and async job
polling are tagged separately. They contribute to the time before model
dispatch but cannot accidentally become the model-dispatch timestamp.

The initial cross-provider fields are:

- `requestBuildMs`;
- `upstreamFetchStartMs`;
- `upstreamHeadersMs`;
- `latencyMs` (first byte/event when observable);
- `generationMs`;
- `transientRetryDelayMs`.
- `upstreamRequestCount`, `upstreamAuthCount`, `upstreamPreflightCount`,
  `upstreamMediaCount`, and `upstreamPollCount`.

At gateway-event level, `time_to_upstream_request_ms` is the first model
dispatch for the whole request. `time_to_latest_upstream_request_ms` is the
latest dispatch after any provider fallback. Each provider-attempt log also
contains its own dispatch and request-count fields.

Provider-specific timing may add fields, but must not change the meaning of the
common fields.

## Policy-specific provider variants

An upstream route that guarantees a materially different data policy is a
separate provider. In particular, a ZDR account, endpoint, deployment, or
required-header configuration must not be represented as a runtime boolean on
the standard provider adapter.

A ZDR route uses its own provider ID and executor registration, while sharing a
`provider_family_id` with the standard route:

```json
{
  "api_provider_id": "example-zdr",
  "provider_family_id": "example",
  "offer_scope": "specialized",
  "offer_label": "ZDR",
  "data_policy_variant": "zdr",
  "zero_data_retention": "default",
  "data_policy_tier": "private",
  "data_policy_confidence": "confirmed"
}
```

The ZDR executor owns whatever makes that guarantee real: a dedicated base URL,
account credential, deployment identifier, request header, or provider-specific
body parameter. ZDR-required routing automatically replaces the standard
family route with this specialized route. Ordinary traffic excludes it unless
the caller explicitly selects the ZDR provider ID.

`zero_data_retention: "optional"` documents provider capability only. It is
never treated as evidence that ZDR is active for a request.
