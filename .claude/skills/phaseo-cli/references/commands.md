# Phaseo CLI command reference

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
phaseo keys update <id-or-hash> [--name <name>] [--disabled true|false] [--limit <amount>] [--limit-reset daily|weekly|monthly] [--expires-at <iso>] --json
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

## Raw authenticated API fallback

```bash
phaseo api get /v1/<path> --json
phaseo api post /v1/<path> --body-json '<json>' --json
phaseo api put /v1/<path> --body-json '<json>' --json
phaseo api patch /v1/<path> --body-json '<json>' --json
phaseo api delete /v1/<path> --json
```

Prefer dedicated commands because they provide safer argument handling and clearer output.
