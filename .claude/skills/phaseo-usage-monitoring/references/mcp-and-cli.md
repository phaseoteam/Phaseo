# Phaseo MCP tools and CLI commands for usage

## Phaseo MCP

The `phaseo` MCP server (`https://mcp.phaseo.app/mcp`) connects through the host's Phaseo OAuth flow. Never ask the user to paste a key into chat. Account tools are read-only and never return historical prompts, responses or credentials. A tool is registered only when its scope was granted, so a missing tool means a missing scope: explain it and use the host's connection flow rather than a workaround.

| Tool | Scope | Inputs | Returns |
| --- | --- | --- | --- |
| `phaseo:credits_get` | `credits:read` | none | `balanceNanos`, `reservedNanos`, `availableNanos`, `thirtyDayUsageNanos`, `thirtyDayRequests` |
| `phaseo:activity_list` | `activity:read` | `days` (1–90), `limit` (1–250), `offset` | `periodDays`, `total`, `totalCostUsd`, `activity[]` |
| `phaseo:analytics_get` | `analytics:read` | `date` (`YYYY-MM-DD`, optional) | `analytics[]`: `date`, `model`, `modelId`, `endpoint`, `provider`, `costUsd`, `byokCostUsd`, `requests`, `inputTokens`, `outputTokens`, `reasoningTokens` |
| `phaseo:logs_list` | `activity:read` | `since`, `from`, `to`, `status`, `provider`, `model`, `endpoint`, `requestId`, `errorCode`, `limit`, `offset` | `logs[]`, `total`, `from`, `to` |
| `phaseo:log_get` | `activity:read` | `requestId` | `log` |
| `phaseo:generation_get` | `generations:read` | `requestId` | `generation` |
| `phaseo:cost_estimate` | `models:read`, `pricing:read` | `modelId`, `providerId`, `inputTokens`, `cachedInputTokens`, `outputTokens` | Input, cached-input, output and total USD for one provider offer |

`activity[]`, `logs[]`, `log` and `generation` share one summary shape: `requestId`, `timestamp`, `provider`, `model`, `endpoint`, `statusCode`, `success`, `errorCode`, `latencyMs`, `generationMs`, `inputTokens`, `outputTokens`, `cachedTokens`, `reasoningTokens`, `totalTokens`, `costUsd`, `currency`, `stream`, `byok`, `throughput`, `location`, `finishReason`. The MCP converts nanos to `costUsd` for you.

MCP limits compared with REST:

- `analytics_get` accepts only `date`. For key, label, end-user, model or BYOK slices, and for CSV export, use the REST endpoint or `phaseo api get`.
- `logs_list` has no `keyId` or `sessionId` filter; use `phaseo logs list --key-id` or `--session-id`, or REST.
- The REST logs endpoint caps `limit` at 200 even though the MCP schema allows up to 250.

Typical calls:

```text
phaseo:credits_get {}
phaseo:analytics_get {"date": "YYYY-MM-DD"}
phaseo:logs_list {"since": "1h", "status": "error", "limit": 20}
phaseo:log_get {"requestId": "G-…"}
phaseo:cost_estimate {"modelId": "<model ID>", "providerId": "<provider>", "inputTokens": 1200, "outputTokens": 300}
```

## `phaseo` CLI

Confirm identity, scopes and workspace first with `phaseo whoami --json`. Always pass `--json` when parsing output.

```bash
phaseo credits get --json
phaseo analytics get --date YYYY-MM-DD --json
phaseo activity list --days 7 --limit 50 --json
phaseo logs list --since 1h --status error --limit 50 --json
phaseo logs list --from <iso> --to <iso> --model <model ID> --json
phaseo logs list --key-id <key-id> --session-id <session-id> --json
phaseo logs get <request-id> --json
phaseo generation get --id <request-id> --json
```

`logs list` flags: `--since` (up to 90 days) or `--from`/`--to`, `--status`, `--provider`, `--model`, `--endpoint`, `--request-id`, `--key-id`, `--session-id`, `--error-code`, `--workspace`, `--limit` (max 200), `--offset`. Do not combine `--since` and `--from`.

`analytics get` only takes `--date` and `--workspace`. For other filters use the authenticated passthrough, which accepts a query string:

```bash
phaseo api get "/v1/analytics?key_id=<key-id>" --json
phaseo api get "/v1/analytics?label_key=team&label_value=support" --json
phaseo api get /v1/budgets --json
phaseo pricing calculate --provider <provider> --model <model ID> --endpoint responses --usage-json '<usage object from the log>'
```

`phaseo api` prints JSON, so fetch the CSV export with `curl` and a management API key instead.

Prefer `logs get` over `generation get`: the generation record may carry replay metadata. The CLI has no live tail, NDJSON export or payload retrieval; do not invent flags for them.

On `403`, check the scopes in `phaseo whoami --json`; log in again with `phaseo login --scopes <csv>` including the needed capability, such as `analytics:read`. Use `--device-code` in SSH, CI or other non-interactive shells.
