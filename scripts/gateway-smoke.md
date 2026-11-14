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
| `insufficient_credit` | paid | the zero-balance key gets 402 for a paid model |
| `buffered_request` | paid | a Chat Completions request returns content, an ID and token usage |
| `streamed_request` | paid | the streamed request returns content, a usage chunk and `[DONE]` |
| `usage_recorded` | free | each request's generation row is successful, priced, and has the token counts the response reported, and cost no more than the published-price bound |
| `abandoned_stream` | paid, DB | a stream the client leaves after its first content chunk is charged once. Its request row, charge row (`applied`, final) and `v2_request_facts` row agree on the cost. If the drain outlived a checkpoint, its `credit_ledger` adjustments add up to that cost and end with the final one (#3633) |
| `upstream_failure_not_charged` | paid, DB | a request the provider rejects (an image on an unresolvable `.invalid` host) fails with `X-Gateway-Error-Origin: upstream`. Its row is unsuccessful with an `upstream:` error code, and it has no cost, no charge, no ledger row and no cost on its fact (#3633) |
| `batch_hold_counts_choices` | paid, DB | a one-row batch with `n: 2` holds credit for both choices: the hold's output bound is at least 2 × 16 tokens (#3633) |
| `batch_settlement` | free, DB | once the batch settles: its reservation is captured at the batch's cost, with one `async_job_charge` ledger row of that amount. Captured and released split the hold. The overdraft equals the actual cost beyond the hold plus the free balance, as `gateway_wallet_settle_once` computes it (#3547). The actual cost stays within the hold |
| `charges_consistent` | free, DB | the buffered and streamed requests' rows agree across request, charge, fact and ledger |
| `billing_settled` | free | the wallet balance fell by exactly the recorded cost of the generations, the abandoned stream and a batch settled during the run. So each request was charged once, and neither the rejected requests nor the upstream failure were charged |

"DB" checks read production rows from `gateway_requests`,
`gateway_request_charges`, `v2_request_facts`, `credit_ledger`,
`gateway_async_operations` and `gateway_wallet_reservations`. Each read runs in a
`begin read only` transaction with a 10-second statement timeout, scoped to the
smoke workspace. Without `PHASEO_SMOKE_DATABASE_URL`, those cases are skipped
and their requests are never sent.

Paid checks run only with `--paid` (the workflow's `paid` input) and a budget in
`PHASEO_SMOKE_MAX_SPEND_USD`, at most $1. A paid run sends one request per
behaviour, all on the cheapest settings:

- two requests capped at 16 output tokens;
- the zero-balance probe, when its key is set;
- with DB access, also the abandoned stream (capped at 64), the failure probe
  (16) and a one-row batch (16 per choice, two choices).

The zero-balance probe is a valid request, which would be charged if its
workspace were ever funded, so a free run never sends it. Before sending any
of them, the check bounds what each request can cost from
`GET /v1/pricing/models`. It counts every billable meter of every active Chat
price row for the model, across providers, service tiers, conditional rules
and time-of-day prices, and takes the dearest price for each meter. A request
is assumed to use 256 prompt tokens, its output cap times its choices, and any
per-request fee.

It sends nothing if the sum of those bounds exceeds the budget. It also sends
nothing if a price cannot be bounded: no price rows, a meter it does not know,
a currency other than USD, or an unreadable price. With a cheap model the
whole run costs well under a cent; keep the budget at $0.05 or less.

A batch can take longer than the run. The run waits up to 20 minutes, polling
`GET /v1/batches/{id}` (which lets the gateway settle it), and otherwise
reports `batch_settlement` as `pending` with the batch ID. Run the workflow
again with `batch_id` set to that ID to verify its settlement. That run reads
the batch and its rows only, and sends nothing billable.

The bound is only as complete as `GET /v1/pricing/models`. Run paid checks only
on a gateway that includes #3450; before it, that endpoint returned at most
1,000 rows per table and could omit the dearest price.

A missing management, zero-balance or database credential reports its checks as
`skip`, never as a pass. A missing smoke key or model stops the run as a
configuration error. Any `fail` exits non-zero; `pending` does not.

Output is one JSON line per check plus a table in the run summary. It holds
check outcomes, HTTP statuses, request and batch IDs, error codes and bounded
reasons only. It never includes keys, the prompt, response content, error
messages or database credentials.

## Setup (once)

1. A dedicated smoke workspace with a small balance, auto top-up off and no
   other traffic: `billing_settled` compares its whole balance. Its UUID goes in
   the variable `GATEWAY_SMOKE_WORKSPACE_ID`. The workspace needs Batch API
   access, or `batch_hold_counts_choices` fails with `batch_not_created`.
2. An API key in it with a spend limit (for example $1 a day):
   `GATEWAY_SMOKE_API_KEY`.
3. A management key for the same workspace that can read credits:
   `GATEWAY_SMOKE_MANAGEMENT_KEY`.
4. A second workspace with no balance and an API key:
   `GATEWAY_SMOKE_LOW_CREDIT_API_KEY`.
5. A read-only Postgres role for the DB checks. Its connection URL, through the
   session pooler or a direct connection with `sslmode=require`, goes in
   `GATEWAY_SMOKE_DATABASE_URL`. These tables have RLS, so the role bypasses it,
   but it can only `SELECT` the columns `QUERIES` reads from the six tables, and
   every session is read-only. The migration
   `supabase/migrations/20261112152648_gateway_smoke_reader_role.sql` creates
   `gateway_smoke_reader` without a login; a query that reads a new column needs
   a migration that grants it. Once that migration has deployed, enable the
   role outside the repo and store its URL as the secret:

   ```sql
   alter role gateway_smoke_reader login password '<generated>';
   ```

6. A GitHub environment `gateway-smoke` with required reviewers. It holds the
   four secrets and these variables:
   - `GATEWAY_SMOKE_MODEL`: a cheap paid model with a stable route. Not a free
     variant, and not a reasoning model, because hidden reasoning tokens would
     spend the 16-token cap.
   - `GATEWAY_SMOKE_WORKSPACE_ID`.
   - Optional `GATEWAY_SMOKE_FAILURE_MODEL`: a cheap model that accepts image
     input and that a provider fetches by URL. It defaults to the smoke model,
     which fails `failure_not_upstream` if the gateway rejects images for it.
   - Optional `GATEWAY_SMOKE_BATCH_MODEL` and `GATEWAY_SMOKE_BATCH_PROVIDER`:
     a cheap model on a provider with batch support. They default to the smoke
     model and the gateway's choice.

Smoke requests send `X-Title: Phaseo gateway smoke`, so the app attribution
identifies them in logs and reporting.

## Run

Actions, "Gateway Smoke", with a reason (the deploy commit or provider change).
Leave `paid` off for a free check of auth, discovery and invalid requests; turn
it on to check credit gating, generation, the charging paths, usage and
billing. Set only `batch_id` to verify a pending batch from an earlier run.

Locally (psql must be on the path for the DB checks):

```sh
PHASEO_SMOKE_API_KEY=… PHASEO_SMOKE_MODEL=… node scripts/gateway-smoke.mjs
PHASEO_SMOKE_MAX_SPEND_USD=0.01 PHASEO_SMOKE_DATABASE_URL=… PHASEO_SMOKE_WORKSPACE_ID=… … node scripts/gateway-smoke.mjs --paid
PHASEO_SMOKE_DATABASE_URL=… PHASEO_SMOKE_WORKSPACE_ID=… … node scripts/gateway-smoke.mjs --batch-id=batch_…
```

`node --test scripts/gateway-smoke.test.mjs` runs the offline tests.

## Failures

| Reason | Look at |
| --- | --- |
| `expected_401` / `expected_404` | gateway auth and key lookup |
| `model_not_listed` | the model's route and the `/v1/models` cache |
| `expected_400`, `expected_402` | request validation; credit gating in `pipeline/before/guards.ts` |
| `http_error`, `not_an_event_stream`, a stream error code | the request ID in Logs, then the provider |
| `request_row_missing`, `usage_differs_from_response`, `cost_missing`, `cost_above_bound` | the audit writer and pricing for that request ID |
| `charge_not_settled`, `charge_differs_from_row_cost`, `expected_cost_differs`, `request_fact_missing`, `fact_cost_differs` | `gateway_request_charges` and the request's `v2_request_facts` row; `pipeline/after/charge.ts` |
| `adjustments_differ_from_charge`, `stepped_charge_not_final` | drain checkpoints in `pipeline/after/stream.ts` and `gateway_charge_request_total` |
| `failure_not_upstream`, `failure_probe_succeeded` | the failure model: choose one with image input whose provider fetches URLs |
| `failed_request_costed`, `failed_request_charged`, `failed_request_in_ledger`, `fact_shows_charge` | the failure audit for that request ID: a failed upstream must not be billed |
| `batch_not_created`, `hold_ignores_choice_count`, `hold_request_count_wrong` | batch access for the workspace; `batchOutputCount` in `core/batch-reservations.ts` |
| `reservation_not_captured`, `settlement_differs_from_batch_cost`, `ledger_differs_from_settlement`, `hold_split_wrong`, `overdraft_wrong`, `actual_above_hold` | batch finalization in `core/batch-finalization.ts` and `gateway_wallet_settle_once` |
| `balance_change_differs_from_recorded_cost` | `gateway_request_charges` for the smoke workspace; see `supabase/operations/gateway-billing-reconciliation.md` |
| `budget_below_cost_bound` | the models' prices; raise the budget or choose cheaper models |
| `cost_bound_unknown` | the models' Chat rows in `/v1/pricing/models`: none, a meter the check does not know, a non-USD price, or an unreadable base or time-window price |
| `psql_unavailable`, `database_query_failed`, `database_output_unreadable` | `GATEWAY_SMOKE_DATABASE_URL` and the reader role's grants |

The maintainer who deploys the gateway or changes a provider runs this check
and owns acting on a failure; outages escalate through incident.io as in
[incident response](../docs/operations/incident-response.md).

## Not covered

- Scheduled runs: paid checks spend credits, so runs are manual.
- A real batch overage. Settlement into overdraft happens only when the actual
  cost exceeds the hold plus the free balance. A correctly sized hold for a
  16-token row never does, and draining the smoke wallet to force one is not
  worth it. `batch_settlement` checks the overage accounting on every
  settlement: overdraft = actual − (hold + free balance), floored at 0. It also
  fails if the actual cost ever exceeds the hold. The offline tests cover a
  real overage.
- Whether drain checkpoints fire: they start 15 s after the client leaves, and
  a 64-token stream usually drains first. `abandoned_stream` reports `stepped`
  and checks the ledger whenever they did.
- Other provider faults: retries and fallbacks are covered offline by the
  provider simulator and AIMock, not by injecting faults in production.
- Endpoints other than Chat Completions and Batches.
