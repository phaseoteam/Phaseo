# Phaseo CLI command reference

## Contents

- [Authentication](#authentication)
- [API keys](#api-keys)
- [Workspaces and policy](#workspaces-and-policy)
- [Discovery, cost, and observability](#discovery-cost-and-observability)
- [Management groups](#management-groups)
- [Raw authenticated API fallback](#raw-authenticated-api-fallback)

Use `--json` for agent workflows. Run `phaseo <group> --help` for the complete installed-version syntax.

## Authentication

```bash
phaseo login [--browser|--device-code] [--scopes <csv>] [--json]
phaseo logout --json
phaseo whoami --json
phaseo version --json
```

## API keys

```bash
phaseo keys current --json
phaseo keys list [--limit <n>] [--offset <n>] [--json]
phaseo keys create --name <name> [--limit <amount>] [--limit-reset daily|weekly|monthly] [--expires-at <iso>] [--disabled] --json
phaseo keys get <id-or-hash> --json
phaseo keys update <id-or-hash> [--name <name>] [--disabled true|false] [--limit <amount>] [--limit-reset daily|weekly|monthly] [--expires-at <iso>] [--ip-allowlist <label=address,...>|none] --json
phaseo keys delete <id-or-hash> --json
```

## Workspaces and policy

```bash
phaseo workspaces list --json
phaseo workspaces get <id-or-slug> --json
phaseo workspaces members <id-or-slug> --json
phaseo presets list --json
phaseo settings get --json
phaseo guardrails list --json
phaseo management-keys list --json
```

Use each group's `--help` before create, update, delete, or membership mutations.

## Discovery, cost, and observability

```bash
phaseo models list [--mine] [--all] [--limit <n>] [--offset <n>] --json
phaseo providers list --json
phaseo pricing models --json
phaseo pricing calculate --provider <provider> --model <model> --endpoint <endpoint> --usage-json '<json>'
phaseo credits get [--workspace <id>] --json
phaseo logs list [--since <15m|1h|7d>] [--from <iso>] [--to <iso>] [--status <success|error|2xx|4xx|5xx|code>] [--provider <id>] [--model <id>] [--endpoint <path>] [--request-id <id>] [--key-id <id>] [--session-id <id>] [--error-code <code>] [--workspace <id>] [--limit <n>] [--offset <n>] --json
phaseo logs get <request-id> [--workspace <id>] --json
phaseo activity list [--workspace <id>] [--days <n>] [--limit <n>] [--offset <n>] --json
phaseo analytics get [--workspace <id>] [--date YYYY-MM-DD] --json
phaseo generation get --id <request-id> --json
```

## Management groups

Every `/v1` management area has a dedicated group. Commands that show `[--yes]` refuse to run without it when stdin is not a terminal or `--json` is set; pass `--yes` only when the user asked for that exact change.

Secrets are never taken from argv. Pipe BYOK keys with `--key-stdin` or name a variable with `--key-env <VAR>` (default `PHASEO_BYOK_KEY`); private model credentials use `--credential-stdin` / `--credential-env` (default `PHASEO_PRIVATE_MODEL_CREDENTIAL`). One-time secrets (SCIM tokens, invite tokens, notification signing secrets) are hidden in human output unless `--show-secret` is passed; `--json` returns them, so capture them straight into a secret store.

`byok` and `private-models` work with the default login scopes; sessions signed in before those scopes were allowed need `phaseo login` again. `feedback`, `events` and `preset-test-runs` need `feedback:read` and `feedback:write`, which the default login does not request; add them with an explicit `phaseo login --scopes` list.

### byok

```bash
phaseo byok list [--provider <id>] [--limit <n>] [--offset <n>] --json
phaseo byok create --provider <id> --name <name> [--key-stdin | --key-env <VAR>] [--routing-mode priority|fallback] [--allowed-models <id,id>] [--allowed-key-ids <id,id>] [--enabled true|false] --json
phaseo byok get <id> --json
phaseo byok update <id> [--name <name>] [--enabled true|false] [--routing-mode priority|fallback] [--allowed-models <id,id>] [--allowed-key-ids <id,id>] [--key-stdin | --key-env <VAR>] --json
phaseo byok delete <id> [--yes] --json
phaseo byok reorder --provider <id> --routing-mode priority|fallback --key-ids <id,id> --json
```

### budgets

```bash
phaseo budgets list --json
phaseo budgets create --interval daily|weekly|monthly|lifetime --limit <usd> --json
phaseo budgets get <id> --json
phaseo budgets update <id> [--interval daily|weekly|monthly|lifetime] [--limit <usd>] --json
phaseo budgets delete <id> [--yes] --json
```

### department-budgets

```bash
phaseo department-budgets list [--department <id>] --json
phaseo department-budgets create --department <id> --interval daily|weekly|monthly --limit <usd> --json
phaseo department-budgets get <id> --json
phaseo department-budgets update <id> [--interval daily|weekly|monthly] [--limit <usd>] --json
phaseo department-budgets delete <id> [--yes] --json
```

### spend-rules

```bash
phaseo spend-rules list [--limit <n>] [--offset <n>] --json
phaseo spend-rules create [--name <name>] [--metric spend|budget_percent|forecast|spike|balance] [--scope-type workspace|key|member|department|model|provider] [--scope-id <id>] [--period day|week|month|rolling] [--threshold-percents <n,n>] [--threshold-amount-usd <usd>] [--action notify|block] [--block-at-percent <n>] [--destination-ids <id,id>] [--enabled true|false] [--body-json <json>] --json
phaseo spend-rules get <id> --json
phaseo spend-rules update <id> [--name <name>] [--metric spend|budget_percent|forecast|spike|balance] [--scope-type workspace|key|member|department|model|provider] [--scope-id <id>] [--period day|week|month|rolling] [--threshold-percents <n,n>] [--threshold-amount-usd <usd>] [--action notify|block] [--block-at-percent <n>] [--destination-ids <id,id>] [--enabled true|false] [--body-json <json>] --json
phaseo spend-rules delete <id> [--yes] --json
phaseo spend-rules test <id> --json
phaseo spend-rules preview <id> --json
phaseo spend-rules history <id> [--limit <n>] [--offset <n>] --json
```

### spend-blocks

```bash
phaseo spend-blocks list [--include-lifted] [--limit <n>] --json
phaseo spend-blocks lift <id> [--yes] --json
```

### rate-limits

```bash
phaseo rate-limits policies list [--limit <n>] [--offset <n>] --json
phaseo rate-limits policies create --name <name> [--description <text>] [--requests-per-minute <n>] [--tokens-per-minute <n>] [--concurrent-requests <n>] [--fail-closed true|false] --json
phaseo rate-limits policies get <id> --json
phaseo rate-limits policies update <id> [--name <name>] [--description <text>] [--requests-per-minute <n>] [--tokens-per-minute <n>] [--concurrent-requests <n>] [--fail-closed true|false] --json
phaseo rate-limits policies delete <id> [--yes] --json
phaseo rate-limits assignments list [--policy <id>] [--target-type key|member|department|guardrail|end_user_default] [--limit <n>] [--offset <n>] --json
phaseo rate-limits assignments create --policy <id> --target-type key|member|department|guardrail|end_user_default [--target <id>] --json
phaseo rate-limits assignments get <id> --json
phaseo rate-limits assignments update <id> --policy <id> --json
phaseo rate-limits assignments delete <id> [--yes] --json
```

### observability

```bash
phaseo observability logging-policy get --json
phaseo observability logging-policy update [--enabled true|false] [--retention-days <n>] [--include-provider-payloads true|false] --json
phaseo observability destinations list [--limit <n>] [--offset <n>] --json
phaseo observability destinations create --type <type> --name <name> (--config-stdin | --config-env <VAR> | --config-json <json>) [--enabled true|false] [--privacy-mode true|false] [--sampling-rate <0-1>] [--body-json <json>] --json
phaseo observability destinations get <id> --json
phaseo observability destinations update <id> [--name <name>] [--config-stdin | --config-env <VAR> | --config-json <json>] [--enabled true|false] [--privacy-mode true|false] [--sampling-rate <0-1>] [--body-json <json>] --json
phaseo observability destinations delete <id> [--yes] --json
```

### notifications

```bash
phaseo notifications settings get --json
phaseo notifications settings update [--auto-top-up true|false] [--auto-top-up-threshold-usd <usd>] [--auto-top-up-amount-usd <usd>] [--payment-method <id>] [--low-balance-email true|false] [--low-balance-threshold-usd <usd>] [--auto-top-up-failure-email true|false] [--payment-method-expiring-email true|false] [--model-deprecation-email true|false] [--department-attribution all|primary] [--billing-time-zone <tz>] [--body-json <json>] --json
phaseo notifications destinations list --json
phaseo notifications destinations create --name <name> --type email|discord|discord_webhook|slack|microsoft_teams|custom_webhook (--target <value> | --target-stdin) [--show-secret] --json
phaseo notifications destinations delete <id> [--yes] --json
phaseo notifications destinations test <id> | --type <type> (--target <value> | --target-stdin) --json
phaseo notifications destinations rotate-secret <id> [--yes] [--show-secret] --json
phaseo notifications routes list --json
phaseo notifications routes set <event-kind> (--destination-ids <id,id> | --clear) --json
```

### routing

```bash
phaseo routing dynamic-routes list [--limit <n>] [--offset <n>] --json
phaseo routing dynamic-routes create --name <name> --config-json <json> [--slug <slug>] [--description <text>] [--status active|paused] --json
phaseo routing dynamic-routes get <id> --json
phaseo routing dynamic-routes update <id> [--name <name>] [--description <text>] [--status active|paused] [--config-json <json>] --json
phaseo routing dynamic-routes delete <id> [--confirm-name <name>] [--yes] --json
phaseo routing dynamic-routes set-keys <id> (--key-ids <id,id> | --clear) --json
phaseo routing dynamic-routes deploy <id> <version> --json
```

### private-models

```bash
phaseo private-models list --json
phaseo private-models create --model-reference <ref> --name <name> --base-url <url> --upstream-model <id> [--credential-stdin | --credential-env <VAR>] [--description <text>] [--supports-responses true|false] [--enabled true|false] [--context-length <n>] [--max-output-tokens <n>] [--routing-policy preferred|balanced|fallback] --json
phaseo private-models get <id> --json
phaseo private-models update <id> [--name <name>] [--base-url <url>] [--upstream-model <id>] [--credential-stdin | --credential-env <VAR>] [--description <text>] [--supports-responses true|false] [--enabled true|false] [--context-length <n>] [--max-output-tokens <n>] [--routing-policy preferred|balanced|fallback] --json
phaseo private-models delete <id> [--yes] --json
```

### classifiers

```bash
phaseo classifiers list --json
phaseo classifiers create --name <name> --model <id> --dimensions-json <json> [--instructions <text>] [--description <text>] [--sample-rate <0-1>] [--sample-by request|session] [--input-scope prompt|prompt_and_response] [--monthly-budget-usd <usd>] [--enabled true|false] [--body-json <json>] --json
phaseo classifiers get <id> --json
phaseo classifiers update <id> [--name <name>] [--model <id>] [--dimensions-json <json>] [--instructions <text>] [--description <text>] [--sample-rate <0-1>] [--sample-by request|session] [--input-scope prompt|prompt_and_response] [--monthly-budget-usd <usd>] [--enabled true|false] [--body-json <json>] --json
phaseo classifiers delete <id> [--yes] --json
```

### data-contribution

```bash
phaseo data-contribution get --json
phaseo data-contribution enable [--reason <text>] --json
phaseo data-contribution disable [--reason <text>] --json
phaseo data-contribution classifiers create --name <name> [--body-json <json>] --json
phaseo data-contribution classifiers update <id> --body-json <json> --json
phaseo data-contribution classifiers delete <id> --json
```

### presets

```bash
phaseo presets versions list <preset> --json
phaseo presets versions create <preset> [--release-notes <text>] [--version-label <label>] --json
phaseo presets labels list <preset> --json
phaseo presets labels set <preset> <label> (--version-id <id> | --version <version>) --json
phaseo presets labels delete <preset> <label> [--yes] --json
phaseo presets fork <preset> [--source-version-id <id>] --json
phaseo presets upstream <preset> --version-id <id> --json
phaseo presets publisher get --json
phaseo presets publisher set --handle <handle> --json
```

### workspaces

```bash
phaseo workspaces set-role <workspace> <user-id> --role admin|member --json
phaseo workspaces invites list <workspace> [--limit <n>] [--offset <n>] --json
phaseo workspaces invites create <workspace> [--role admin|member] [--expires-in-days <n>] [--max-uses <n>] [--show-secret] --json
phaseo workspaces invites revoke <workspace> <invite-id> [--yes] --json
phaseo workspaces join-requests list <workspace> [--status pending|approved|denied] [--limit <n>] [--offset <n>] --json
phaseo workspaces join-requests approve <workspace> <request-id> --json
phaseo workspaces join-requests reject <workspace> <request-id> --json
```

### identity

```bash
phaseo identity sso get --json
phaseo identity sso update --enabled true|false --mode none|saml|custom_oidc [--provider-identifier <id>] [--domains <domain,domain>] --json
phaseo identity scim get --json
phaseo identity scim update --enabled true|false --json
phaseo identity scim tokens create [--label <label>] [--expires-at <iso>] [--show-secret] --json
phaseo identity scim tokens revoke <id> [--yes] --json
phaseo identity scim audit [--limit <n>] [--before <iso>] --json
phaseo identity directory list --json
phaseo identity directory update <user-id> [--access-role directory|admin|member] [--department-mode directory|department|none] [--department <id>] [--department-position member|lead] --json
phaseo identity departments list --json
phaseo identity departments create --name <name> [--description <text>] [--icon <icon>] [--color <color>] --json
phaseo identity departments update <id> [--name <name>] [--description <text>] [--icon <icon>] [--color <color>] --json
phaseo identity departments delete <id> [--yes] --json
phaseo identity departments set-member <department-id> <user-id> [--position member|lead] [--primary true|false] --json
phaseo identity departments remove-member <department-id> <user-id> [--yes] --json
phaseo identity group-mappings list --json
phaseo identity group-mappings create --scim-group <id> --department <id> [--access-role member|admin] [--department-position member|lead] --json
phaseo identity group-mappings update <id> [--access-role member|admin] [--department-position member|lead] --json
phaseo identity group-mappings delete <id> [--yes] --json
```

### workload-identity

```bash
phaseo workload-identity policies list --json
phaseo workload-identity policies create --name <name> --provider vercel|github_actions --owner-id <id> [--issuer <url>] [--claim-conditions-json <json>] [--max-token-lifetime-seconds <n>] --json
phaseo workload-identity policies get <id> --json
phaseo workload-identity policies update <id> [--name <name>] [--status active|disabled] [--claim-conditions-json <json>] [--max-token-lifetime-seconds <n>] --json
phaseo workload-identity policies delete <id> [--yes] --json
```

### keys

```bash
phaseo keys rotate <id> [--previous-key-expires-at <iso>] [--show-secret] [--yes] --json
phaseo keys invalidate <id> [--yes] --json
```

### webhooks

```bash
phaseo webhooks test <id> --json
```

### analytics

```bash
phaseo analytics export [--date YYYY-MM-DD] [--workspace <id>] [--key-id <id>] [--model <id>] [--provider <id>] [--endpoint <id>] [--label-key <key> --label-value <value>] [--end-user-id <id>] [--byok true|false] [--success true|false] --json
```

### events

```bash
phaseo events list [--request-id <id>] [--session-id <id>] [--preset-id <id>] [--test-run-id <id>] [--category feedback|behavior|outcome|app|test|custom] [--event <name>] [--limit <n>] [--offset <n>] --json
phaseo events create --event-name <name> [--category feedback|behavior|outcome|app|test|custom] [--request-id <id>] [--session-id <id>] [--preset-id <id>] [--numeric-value <n>] [--value-json <json>] [--occurred-at <iso>] [--body-json <json>] --json
```

### audit-events

```bash
phaseo audit-events list [--limit <n>] [--cursor <cursor>] [--action <action>] [--target-type <type>] --json
```

### apps

```bash
phaseo apps list [--limit <n>] [--offset <n>] --json
phaseo apps update <id> [--title <title>] [--url <url>] [--docs-url <url>] [--image-url <url>] [--public true|false] [--active true|false] [--category <category>] --json
phaseo apps merge <id> --into <target-app-id> [--yes] --json
```

### feedback

```bash
phaseo feedback list [--request-id <id>] [--session-id <id>] [--preset-id <id>] [--test-run-id <id>] [--rating <rating>] [--since <iso>] [--until <iso>] [--limit <n>] [--offset <n>] --json
phaseo feedback create [--request-id <id>] [--session-id <id>] [--preset-id <id>] [--rating <rating>] [--score <n>] [--reason <text>] [--comment <text>] [--body-json <json>] --json
phaseo feedback summary [--group-by <field>] [--metadata-key <key>] [--preset-id <id>] [--test-run-id <id>] [--since <iso>] [--until <iso>] --json
```

### preset-test-runs

```bash
phaseo preset-test-runs list [--preset-id <id>] [--limit <n>] [--offset <n>] --json
phaseo preset-test-runs create [--preset-id <id>] [--baseline-preset-id <id>] [--name <name>] [--description <text>] [--dataset-name <name>] [--status pending|running|completed|failed|cancelled] [--body-json <json>] --json
phaseo preset-test-runs get <id> --json
phaseo preset-test-runs update <id> [--name <name>] [--description <text>] [--status pending|running|completed|failed|cancelled] [--summary-json <json>] [--body-json <json>] --json
```

## Account, routing, and workspace settings

```bash
phaseo profile get --json
phaseo profile update [--display-name <name>] [--default-workspace <id>|none] [--obfuscate-info true|false] --json
phaseo authorized-apps list --json
phaseo authorized-apps update-scopes <id> --scopes <scope,...> --json
phaseo authorized-apps revoke <id> --yes --json
phaseo invites accept <code> --json
phaseo invites requests [--status pending|approved|denied|cancelled|all] --json
phaseo rate-limits tier get --json
phaseo rate-limits tier raise --json
phaseo routing auto get --json
phaseo routing auto update [--allowed-patterns <provider/model,...>|none] [--spend-profile <profile>] [--objective balanced|quality|cost|latency] [--allow-fallbacks true|false] --json
phaseo routing successors list --json
phaseo routing successors set --model <id> (--successor <id> | --never) --json
phaseo routing successors remove --model <id> --json
phaseo observability destinations test <id> --json
phaseo observability destinations sample <id> --json
phaseo observability destinations test-config --type <type> --config-stdin --json
phaseo classifiers test [<id>] --prompt-stdin [--model <id> --dimensions-json '<json>'] --json
```

- `profile`, `authorized-apps` and `invites` act as the signed-in person; management keys cannot use them.
- `rate-limits tier raise` works only for the workspace owner. `authorized-apps update-scopes` can only remove scopes.
- `classifiers test` makes a billed model request with the session's own credential, so the session needs `gateway:access` as well as `classifiers:write`. The CLI sign-in cannot be granted `gateway:access` today, so the command returns `403 gateway_access_required`; use the dashboard's test until that changes. Never run it without the user's approval to spend credits.
- Destination settings contain credentials: pass them with `--config-stdin` or `--config-env <VAR>`, not on the command line.

## Raw authenticated API fallback

```bash
phaseo api get /v1/<path> --json
phaseo api post /v1/<path> --body-json '<json>' --json
phaseo api put /v1/<path> --body-json '<json>' --json
phaseo api patch /v1/<path> --body-json '<json>' --json
phaseo api delete /v1/<path> --json
```

Prefer dedicated commands because they provide safer argument handling and clearer output.
