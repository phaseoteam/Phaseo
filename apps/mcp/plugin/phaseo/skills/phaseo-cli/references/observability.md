# Request investigation with the Phaseo CLI

## Triage sequence

1. Confirm identity and workspace with `phaseo whoami --json`.
2. List a narrow request window with `phaseo logs list --since 1h --limit 50 --json`.
3. Add server-side filters such as `--status error`, `--provider`, `--model`, or `--endpoint`.
4. Fetch one redacted record with `phaseo logs get <request-id> --json`.
5. Compare aggregate usage with `phaseo analytics get --date YYYY-MM-DD --json` and balance with `phaseo credits get --json` when cost is relevant.

If the application already captured a Phaseo request ID, skip directly to `logs get`.

## List filters

`logs list` supports:

- time: `--since <number>m|h|d` up to 90 days, or `--from <iso>` with optional `--to <iso>`
- outcome: `--status success|error|1xx|2xx|3xx|4xx|5xx|<exact-code>` and `--error-code`
- execution: `--provider`, `--model`, and `--endpoint`
- correlation: `--request-id`, `--key-id`, and `--session-id`
- scope/pagination: `--workspace`, `--limit`, and `--offset`

Do not combine `--since` and `--from`. Results are newest first. The default window is 24 hours, default limit is 50, and maximum limit is 200.

## Log fields

List and detail records may include:

- request status: `status_code`, `success`, `error_code`, redacted `error_message`
- execution: `provider`, `model_id`, requested/routed/canonical model IDs, `endpoint`, `stream`, `byok`
- timing: `latency_ms`, `generation_ms`, `throughput`
- accounting: `usage`, `cost_nanos`, `currency`, `pricing_lines`
- correlation: `request_id`, `key_id`, `session_id`, `auth_method`, `oauth_client_id`, `native_response_id`
- result metadata: `finish_reason`, `location`, `created_at`

The logs endpoints deliberately exclude request/replay payloads, prompts, authorization headers, raw trace blobs, and end-user identifiers. Error messages are truncated and redact common bearer/API-key formats.

## Safe diagnostic summary

Prefer this minimal shape when reporting an incident:

```json
{
  "request_id": "...",
  "created_at": "...",
  "endpoint": "...",
  "model_id": "...",
  "provider": "...",
  "status_code": 500,
  "error_code": "...",
  "latency_ms": 1234,
  "cost_nanos": 0
}
```

Do not reproduce the complete error message when a concise category is sufficient.

## Legacy observability commands

`phaseo activity list` remains available for a compact usage-oriented view. `phaseo generation get` may expose replay metadata and should not be the default agent investigation path. Prefer `logs list` followed by `logs get`.

## Current limitations

The CLI does not currently provide live tail/follow, cursor pagination, NDJSON export, or payload retrieval. Do not invent unsupported flags or bypass the redacted logs endpoints.
