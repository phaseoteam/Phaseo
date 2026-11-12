# Usage and spend endpoints

## Contents

- [Credentials and units](#credentials-and-units)
- [Capture a request ID with attribution](#capture-a-request-id-with-attribution)
- [Credits](#credits)
- [Analytics and CSV export](#analytics-and-csv-export)
- [Activity](#activity)
- [Request logs](#request-logs)
- [Generation lookup](#generation-lookup)
- [Current key and budgets](#current-key-and-budgets)
- [Repricing a request](#repricing-a-request)

## Credentials and units

All paths are under `https://api.phaseo.app/v1`. Management endpoints need a management API key (`Authorization: Bearer $PHASEO_MANAGEMENT_KEY`) with the listed capability, or an OAuth token with the same scope. A scope is necessary but not sufficient: the caller must also belong to the workspace with the required role. Gateway API keys (`PHASEO_API_KEY`) only work for inference and `GET /v1/key`.

| Field style | Unit |
| --- | --- |
| `*_nanos` (`cost_nanos`, `balance_nanos`, `available_nanos`) | USD × 10^9 |
| `total_cost_cents`, `cost_cents` | US cents |
| Analytics `usage`, `byok_usage_inference`; key `limit`, `usage*`; budget `limit`, `usage`, `remaining` | USD |

## Capture a request ID with attribution

```bash
curl -sS https://api.phaseo.app/v1/responses \
  -D headers.txt -o /dev/null \
  -H "Authorization: Bearer $PHASEO_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-App-Id: acme-support" \
  -H 'X-Phaseo-Metadata: {"labels":[{"key":"team","value":"support"}]}' \
  -d '{"model": "phaseo/free", "input": "Reply with only: ok", "usage": true}'

grep -i '^x-request-id' headers.txt
```

The body is discarded on purpose. In application code, keep `usage`, `cost_nanos`, `currency` and the request ID, not the output text.

## Credits

`GET /v1/credits` (`credits:read`). Optional `workspace_id` must match the authenticated workspace.

Response `credits`: `balance_nanos`, `reserved_nanos`, `available_nanos`, `remaining`, `thirty_day_usage` (nanos, nullable; the OpenAPI example is negative, so compare magnitudes) and `thirty_day_requests`.

```bash
curl -sS "https://api.phaseo.app/v1/credits" \
  -H "Authorization: Bearer $PHASEO_MANAGEMENT_KEY"
```

## Analytics and CSV export

`GET /v1/analytics` (`analytics:read`). Grouped by date, model, provider and endpoint over the last 30 completed UTC days, bounded to 10,000 source requests.

| Query | Notes |
| --- | --- |
| `date` | One UTC date, `YYYY-MM-DD` |
| `label_key`, `label_value` | Both required together; exact label pair from `X-Phaseo-Metadata` |
| `key_id` | API key identifier |
| `end_user_id` | Application-defined end-user ID |
| `model`, `provider`, `endpoint` | Model ID, provider slug, endpoint identifier such as `chat.completions` |
| `byok`, `success` | Booleans |
| `limit`, `offset` | `limit` 1–1000, default 1000 |

Each `data` row: `date`, `model`, `model_permaslug`, `endpoint_id`, `provider_name`, `usage` (USD), `byok_usage_inference` (USD), `requests`, `prompt_tokens`, `completion_tokens`, `reasoning_tokens`. The envelope has `total_count`, `offset` and `limit`.

```bash
curl -sS "https://api.phaseo.app/v1/analytics?label_key=team&label_value=support" \
  -H "Authorization: Bearer $PHASEO_MANAGEMENT_KEY"
```

`GET /v1/analytics/export` takes the same filters, without pagination, and returns all matching aggregate rows as spreadsheet-safe CSV:

```bash
curl -sS "https://api.phaseo.app/v1/analytics/export?byok=false" \
  -H "Authorization: Bearer $PHASEO_MANAGEMENT_KEY" -o phaseo-analytics.csv
```

## Activity

`GET /v1/activity` (`activity:read`). Query: `days` (default 30), `limit` (1–250, default 50), `offset`, optional `workspace_id`. Returns `period_days`, `total`, `total_cost_cents` and an `activity` array of recent requests. Use it for a quick recent view; use analytics for totals.

## Request logs

`GET /v1/logs` (`activity:read`). Redacted request facts, newest first.

| Query | Notes |
| --- | --- |
| `since` | Relative window such as `15m`, `1h`, `7d`; default `24h` |
| `from`, `to` | ISO date-times; do not combine with `since` |
| `status` | `success`, `error`, a class such as `4xx`, or an exact code |
| `provider`, `model`, `endpoint` | Execution filters |
| `request_id`, `key_id`, `session_id`, `error_code` | Correlation filters |
| `limit`, `offset` | `limit` 1–200, default 50 |

`GET /v1/logs/{requestId}` returns one record under `data`.

Log fields: `request_id`, `created_at`, `endpoint`, `model_id`, `requested_model_id`, `routed_model_id`, `canonical_model_id`, `provider`, `status_code`, `success`, `error_code`, `latency_ms`, `generation_ms`, `usage`, `cost_nanos`, `currency`, `pricing_lines`, `key_id`, `auth_method`, `oauth_client_id`, `stream`, `byok`, `native_response_id`, `throughput`, `location`, `finish_reason`.

Logs exclude prompts, outputs, authorization headers and end-user identifiers.

```bash
curl -sS "https://api.phaseo.app/v1/logs?since=1h&status=error&limit=20" \
  -H "Authorization: Bearer $PHASEO_MANAGEMENT_KEY"
```

## Generation lookup

`GET /v1/generations?id=<request-id>` (`generations:read`). Accepts `G-<ULID>` IDs and older UUIDs. Returns `request_id`, `app_id`, `endpoint`, `model_id`, `provider`, `native_response_id`, `stream`, `byok`, `status_code`, `success`, `error_code`, `error_message`, `latency_ms`, `generation_ms`, `usage`, `cost_nanos`, `currency`, `pricing_lines`, `key_id`, `throughput`, `replay_supported` and `replay_request`.

`replay_request` is the stored request body and can contain prompts. Do not print, log or forward it; use `/v1/logs/{requestId}` when you only need cost and status.

## Current key and budgets

`GET /v1/key`, authenticated with the gateway API key being inspected, returns under `data`:

- `limit` (USD), `limit_reset` (`daily`, `weekly`, `monthly`), `limit_remaining`
- `usage`, `usage_daily`, `usage_weekly`, `usage_monthly` (USD)
- `limits.{daily,weekly,monthly}.{requests,cost}` and `usage_details.{total,daily,weekly,monthly}.{requests,cost}`
- `disabled`, `soft_blocked`, `expires_at`

BYOK traffic is excluded from the key spend limit.

`GET /v1/budgets` (`budgets:read`; OAuth callers need the owner or admin role) lists workspace spend ceilings, one per `interval` (`daily`, `weekly`, `monthly`, `lifetime`), with `limit`, `usage`, `remaining` (USD and `_nanos`), `exceeded`, `window_start` and `reset_at`. Usage counts successful requests plus active async holds. `GET /v1/budgets/{id}` returns one budget. Use `phaseo-guardrails` to create or change limits and budgets.

## Repricing a request

`POST /v1/pricing/calculate` (`pricing:read`) prices a usage payload against active gateway pricing. Required body fields: `provider`, `model` (the routed model ID), `endpoint` (such as `responses` or `chat.completions`) and `usage`.

Take all four from the request log and pass its `usage` object unchanged. A total that differs from the logged `cost_nanos` usually points to a meter that was charged differently than expected, such as cached input, reasoning tokens or server tools; the log's `pricing_lines` show each charged line.
