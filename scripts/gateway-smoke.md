# Gateway smoke

`gateway-smoke.mjs` checks the production gateway with real credentials after a
gateway deploy or a provider change. Run it from the "Gateway Smoke" workflow,
or locally with the same environment variables. The public health pilot
(`health-pilot.mjs`) and the offline provider simulator do not cover
authenticated requests, usage or billing; this does.

## Checks

| Check | Costs | Passes when |
| --- | --- | --- |
| `auth_rejects_invalid_key` | free | an invalid key gets 401 |
| `auth_accepts_key` | free | the smoke key gets 404 for an unknown generation ID, not 401 |
| `discovery` | free | `GET /v1/models` lists `PHASEO_SMOKE_MODEL` |
| `invalid_request` | free | a malformed Chat Completions body gets 400 |
| `insufficient_credit` | free | the zero-balance key gets 402 for a paid model |
| `buffered_request` | paid | a Chat Completions request returns content, an ID and token usage |
| `streamed_request` | paid | the streamed request returns content, a usage chunk and `[DONE]` |
| `usage_recorded` | free | each request's generation row is successful, priced, and has the token counts the response reported; the total is within budget |
| `billing_settled` | free | the wallet balance fell by exactly the recorded cost, so each request was charged once and the rejected requests were not charged |

Paid checks run only with `--paid` (the workflow's `paid` input) and a budget in
`PHASEO_SMOKE_MAX_SPEND_USD`, at most $1. Each paid run sends two requests
capped at 16 output tokens. A check without its credential is reported as
`skip`, never as a pass. Any `fail` exits non-zero.

Output is one JSON line per check plus a table in the run summary, with check
outcomes, HTTP statuses, request IDs, error codes and bounded reasons only. It
never includes keys, the prompt, response content or error messages.

## Setup (once)

1. A dedicated smoke workspace with a small balance, auto top-up off and no
   other traffic: `billing_settled` compares its whole balance.
2. An API key in it with a spend limit (for example $1 a day):
   `GATEWAY_SMOKE_API_KEY`.
3. A management key for the same workspace that can read credits:
   `GATEWAY_SMOKE_MANAGEMENT_KEY`.
4. A second workspace with no balance and an API key:
   `GATEWAY_SMOKE_LOW_CREDIT_API_KEY`.
5. A GitHub environment `gateway-smoke` with required reviewers, holding the
   three secrets, and the variable `GATEWAY_SMOKE_MODEL`: a cheap paid model
   with a stable route, not a free variant.

Smoke requests send `X-Title: Phaseo gateway smoke`, so the app attribution
identifies them in logs and reporting.

## Run

Actions, "Gateway Smoke", with a reason (the deploy commit or provider change).
Leave `paid` off for a free check of auth, discovery and rejections; turn it on
to check generation, usage and billing.

Locally:

```sh
PHASEO_SMOKE_API_KEY=… PHASEO_SMOKE_MODEL=… node scripts/gateway-smoke.mjs
PHASEO_SMOKE_MAX_SPEND_USD=0.01 … node scripts/gateway-smoke.mjs --paid
```

`node --test scripts/gateway-smoke.test.mjs` runs the offline tests.

## Failures

| Reason | Look at |
| --- | --- |
| `expected_401` / `expected_404` | gateway auth and key lookup |
| `model_not_listed` | the model's route and the `/v1/models` cache |
| `expected_400`, `expected_402` | request validation; credit gating in `pipeline/before/guards.ts` |
| `http_error`, `not_an_event_stream`, a stream error code | the request ID in Logs, then the provider |
| `request_row_missing`, `usage_differs_from_response`, `cost_missing` | the audit writer and pricing for that request ID |
| `balance_change_differs_from_recorded_cost` | `gateway_request_charges` for the smoke workspace; see `supabase/operations/gateway-billing-reconciliation.md` |
| `budget_exceeded` | the model's price; lower the budget or change the model |

The maintainer who deploys the gateway or changes a provider runs this check
and owns acting on a failure; outages escalate through incident.io as in
[incident response](../docs/operations/incident-response.md).

## Not covered

- Scheduled runs: paid checks spend credits, so runs are manual.
- Provider faults: retries and fallbacks are covered offline by the provider
  simulator and AIMock, not by injecting faults in production.
- Endpoints other than Chat Completions.
