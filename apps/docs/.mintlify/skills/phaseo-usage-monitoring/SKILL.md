---
name: phaseo-usage-monitoring
description: "Monitors and debugs Phaseo spend and usage through REST, the phaseo CLI or the Phaseo MCP: credit balance, per-request cost and tokens, log and generation lookup by request ID, analytics by day, model, key or label, 429 rate limits, budgets, alerts and observability destinations. Use when asked why a request cost X or failed, where credits went, to export usage, or about x-request-id, /v1/credits, /v1/analytics, /v1/logs or Retry-After. Not for key restrictions or guardrail setup (phaseo-guardrails), choosing models by price (phaseo-model-selection) or first integration (phaseo-gateway)."
---

# Phaseo usage monitoring

Answer spend and request questions from Phaseo's own records, explain a single request's cost or failure, and add attribution so later questions can be answered by slicing instead of guessing.

## Choose the surface and credential

| Surface | Use when | Credential |
| --- | --- | --- |
| Phaseo MCP (`phaseo:credits_get` and others) | The `phaseo` MCP server is connected | Host OAuth; each tool appears only when its scope was granted |
| `phaseo` CLI | A terminal is available | `phaseo login`; confirm with `phaseo whoami --json` |
| REST management API | Scripts, CI, back-office code | Management API key (`phaseo_v1_mk_…`) with the capability below, or an OAuth token |
| `GET /v1/key` | An app checks its own key's spend and limits | The gateway API key itself (`PHASEO_API_KEY`) |

Gateway API keys (`phaseo_v1_sk_…`) are inference-only and are rejected by management endpoints; `GET /v1/key` is the exception. Keep management keys server-side, for example in `PHASEO_MANAGEMENT_KEY`. Base URL: `https://api.phaseo.app/v1`.

| Question | MCP tool | CLI (`--json`) | REST | Capability |
| --- | --- | --- | --- | --- |
| Balance and 30-day totals | `phaseo:credits_get` | `phaseo credits get` | `GET /v1/credits` | `credits:read` |
| Spend by day, model, provider, endpoint | `phaseo:analytics_get` | `phaseo analytics get --date YYYY-MM-DD` | `GET /v1/analytics` | `analytics:read` |
| Spend by key, label or end user; CSV | — | `phaseo api get "/v1/analytics?key_id=<id>"` | `GET /v1/analytics`, `GET /v1/analytics/export` | `analytics:read` |
| Recent billable requests | `phaseo:activity_list` | `phaseo activity list --days 7` | `GET /v1/activity` | `activity:read` |
| Search requests | `phaseo:logs_list` | `phaseo logs list --since 1h --status error` | `GET /v1/logs` | `activity:read` |
| One request (redacted) | `phaseo:log_get` | `phaseo logs get <request-id>` | `GET /v1/logs/{requestId}` | `activity:read` |
| One generation's cost record | `phaseo:generation_get` | `phaseo generation get --id <request-id>` | `GET /v1/generations?id=<request-id>` | `generations:read` |
| Workspace budgets | — | `phaseo api get /v1/budgets` | `GET /v1/budgets` | `budgets:read` |

Parameters, response fields and units are in [references/endpoints.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-usage-monitoring/references/endpoints.md). MCP tool inputs and CLI flags are in [references/mcp-and-cli.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-usage-monitoring/references/mcp-and-cli.md). With the MCP, discover each tool's input schema before calling it.

## Capture what a response already tells you

Every inference response carries a server-generated request ID in the `x-request-id` header, in `G-<ULID>` form. Error bodies repeat it as `generation_id`. A caller-supplied `x-request-id` does not replace it. Store this ID with your own trace; it is the key for logs, generation lookup and support.

- Token counts are in the response `usage` object. `POST /v1/responses` bodies also return `cost_nanos`, `cost_cents`, `currency` and `pricing_lines`.
- Requests accept `usage: true` and `meta: true` to ask for usage accounting and extra metadata where the endpoint supports them.
- Prompt-cache reads and writes appear as cached-token details in `usage`; see the gateway docs on prompt caching.
- Record only the request ID, model ID, provider, status, token counts and cost. Never log prompts, outputs, full response bodies or API keys.

## Debug "why did this request cost X" or "why did it fail"

1. Get the request ID from the `x-request-id` header or the error body's `generation_id`. If you have none, search: `phaseo:logs_list` (or `GET /v1/logs`) with a narrow `since`, plus `status`, `model`, `endpoint` or `errorCode`.
2. Fetch the redacted record: `phaseo:log_get`, `phaseo logs get <id> --json` or `GET /v1/logs/{id}`.
3. For cost, read `cost_nanos` (USD × 10^9), `usage` and `pricing_lines`. Check which meters were charged: cached reads and writes, reasoning tokens, server tools, or images and audio.
4. Compare `requested_model_id`, `routed_model_id` and `provider`. A fallback, retired-model replacement or `byok: true` (billed by your provider account, not Phaseo credits) explains many surprises.
5. Reprice to confirm: `phaseo:cost_estimate` with the logged token counts and provider, or `POST /v1/pricing/calculate` with `provider`, `model`, `endpoint` and `usage`.
6. For a failure, read `status_code` and `error_code`, then the error body's `error`, `reason` and `provider_failure_diagnostics`. For `429`, use the table below.
7. Check the pattern, not just the one request: `phaseo:analytics_get` or `GET /v1/analytics` filtered by `model`, `key_id` or `success=false`.

```text
Request investigation:
- [ ] Request ID captured (G-…) or found with logs_list
- [ ] Redacted log fetched; status, error_code, provider, model recorded
- [ ] Cost explained from usage + pricing_lines (or byok noted)
- [ ] Routed model/provider compared with requested model
- [ ] Repriced with cost_estimate or /v1/pricing/calculate
- [ ] Aggregate checked for a wider pattern
- [ ] Summary shared without prompts, outputs or key material
```

Prefer logs over `GET /v1/generations` for investigation: a generation record can include `replay_request`, the stored request body. Never print or paste that field.

## Spend overviews: aggregate, don't sum rows

- Use `GET /v1/analytics` (or `phaseo:analytics_get`) for totals. It groups cost, requests and tokens by date, model, provider and endpoint, and filters by `date`, `label_key` + `label_value`, `key_id`, `end_user_id`, `model`, `provider`, `endpoint`, `byok` and `success`. Its `usage` field is USD cost, not tokens.
- Analytics covers the last 30 completed UTC days and at most 10,000 source requests per query. For today, use `GET /v1/logs` or `GET /v1/activity`, or `credits_get` for the 30-day total.
- Export with `GET /v1/analytics/export` (same filters, CSV). Do not page through logs or activity to add up cost client-side.
- Units differ: credits and logs use nanos (USD × 10^9), activity uses `total_cost_cents`, analytics, key and budget amounts use USD.

## Rate limits and spend limits (429)

| Error / reason | Cause | Action |
| --- | --- | --- |
| reason `customer_requests_per_minute` | Workspace per-user RPM allowance | Wait `Retry-After` seconds, then reduce concurrency |
| reason `free_requests_per_day` or `phaseo_free_model_limit_exceeded` | Daily free-model allowance (resets 00:00 UTC) | Wait, or use a paid model |
| `rate_limit_exceeded` with `policy_id`, `limit_scope` | Workspace rate limit policy | Wait `Retry-After`; ask an admin to change the policy |
| `key_limit_exceeded` with `limit_window`, `reset_at` | Key request/spend limit or workspace budget | If `Retry-After` is absent it will not reset by itself: raise the limit or budget |
| Provider `429` | Upstream throttling | Respect the forwarded `Retry-After`; BYOK adds `X-Phaseo-Upstream-RateLimit-*` |

`Retry-After` can be seconds or an HTTP date; validate it. Policy-limited responses include `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests` (approximate) and `x-ratelimit-reset-requests`. Never resubmit an ambiguous async job; check its status.

To read limits: `GET /v1/key` with the gateway key returns `limit`, `limit_remaining`, `limit_reset`, `usage_daily`/`usage_weekly`/`usage_monthly` and per-window `limits`; `GET /v1/budgets` returns each budget's `usage`, `remaining`, `exceeded` and `reset_at`. Creating or changing limits and budgets belongs to `phaseo-guardrails`.

## Attribute spend before you need it

- `X-App-Id` (stable), with optional `X-App-Name`, `HTTP-Referer` and `X-App-Categories`; `X-Title` is an alias for the app name.
- `X-Phaseo-Metadata: {"labels":[{"key":"team","value":"support"}]}` - up to 32 labels, sliced with `label_key` + `label_value` in analytics. Labels are not sent to providers.
- An end-user ID in the request `user` field or `X-Phaseo-User-Id` header; filter analytics with `end_user_id`.
- Separate API keys per service or environment; filter with `key_id`.
- `session_id` in the request body (also used for prompt-cache affinity); `GET /v1/logs` filters by `session_id`.

Never put emails, customer names, secrets or prompt text in IDs, labels or headers.

## Alerts and exports to other tools

Low-balance email thresholds, auto top-up, and notification routes (`low_balance`, `auto_top_up_failed`, `payment_method_expiring`, `model_deprecation`, `model_substitution`) to email, Slack, Discord, Teams or HTTPS webhooks, plus observability destinations (`webhook` or `otel_collector`) and the I/O logging policy, are covered in [references/alerts-and-destinations.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-usage-monitoring/references/alerts-and-destinations.md).

## Rules

- Scope reads to the question: narrow time window, filters, small `limit`.
- Report request IDs and summary fields; treat key IDs, session IDs and provider error text as sensitive.
- On `401` check the key type; on `403` check the capability or OAuth scope and workspace role; do not work around authorization.
- Do not start paid inference to "test" a cost question unless the user asks; use `phaseo/free` for smoke tests.

## Validate

After adding monitoring code, make one `phaseo/free` request, read its `x-request-id`, fetch it with `GET /v1/logs/{id}` (or `phaseo:log_get`), and confirm your stored fields match the log without containing prompt or output text.
