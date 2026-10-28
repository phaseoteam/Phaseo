---
name: phaseo-cli
description: "Operates Phaseo from the terminal with the official `phaseo` CLI: install and update, browser or device OAuth login, API keys, workspaces, presets, BYOK, budgets, spend rules, rate limits, notifications, observability, routing, identity and other workspace settings, plus credits and human-confirmed top-ups, analytics and request lookup by ID, with `--json` output for automation. Use when the user runs or wants `phaseo` commands, scripts Phaseo admin work or debugs a request from a shell. Not for application code that calls the API (use phaseo-gateway or an SDK skill)."
license: MIT
---

# Phaseo CLI

Use the official CLI as the first choice for authenticated Phaseo control-plane work and request investigation.

## Workflow

1. Confirm the CLI and identity:

```bash
phaseo version --json
phaseo whoami --json
```

If authentication is missing, use `phaseo login`. Prefer `phaseo login --device-code` in SSH, CI, remote shells, or non-interactive environments. Never automate entry of a user's credentials.

2. Prefer a dedicated subcommand with `--json`. Read [references/commands.md](references/commands.md) when exact syntax is needed.

3. Use `phaseo api <method>` only when no dedicated subcommand exists; nearly every `/v1` management route has one (see the Management groups section of the command reference). Keep paths under `/v1`; the CLI supplies authentication.

4. Before a mutation, inspect the current resource and workspace. After a mutation, fetch it again or use the relevant list command to verify the result.

## Investigate Requests

Read [references/observability.md](references/observability.md) for response fields, safe handling, and known limitations.

Start broad, then drill into one request:

```bash
phaseo logs list --since 1h --status error --limit 50 --json
phaseo logs get <request-id> --json
phaseo analytics get --date YYYY-MM-DD --json
phaseo credits get --json
```

Use the narrowest useful server-side filters. Select a request ID from the list, then use `logs get` for its redacted status, error, usage, routing, timing, and cost metadata.

Treat provider error text, session identifiers, and key identifiers as sensitive metadata. Summarize the minimum fields needed to diagnose the issue. `logs` does not expose prompts, replay requests, headers, or trace blobs; do not bypass that boundary with raw database access.

## Manage Keys Safely

API-key creation returns the plaintext secret once. Never print it into chat, logs, screenshots, shell history, or committed files. Capture it directly into an approved secret store or environment configuration.

Use `keys` for inference keys and `management-keys` for scoped automation. Verify deletion by confirming the key is absent from the active list; deleted keys may remain as disabled audit tombstones.

## Secrets and Destructive Commands

Never pass secrets as argv values; the CLI rejects `--key` and `--credential`, and rejects secret fields inside `--body-json` for `byok` and `private-models`. Pipe BYOK keys with `--key-stdin` or use `--key-env <VAR>`, and private model credentials with `--credential-stdin` or `--credential-env <VAR>`. Prefer `--target-stdin` for webhook notification targets and `--config-stdin` or `--config-env <VAR>` for observability destination configs that hold API keys.

Commands whose usage shows `[--yes]` (delete, revoke, lift, rotate, rotate-secret, merge) refuse to run non-interactively without `--yes`. Pass `--yes` only after the user has asked for that exact change.

`byok` and `private-models` work with the default login scopes. A `403` from them usually means the session predates those scopes; ask the user to run `phaseo login` again. `feedback`, `events` and `preset-test-runs` need `feedback:read` and `feedback:write`, which the default login does not request; suggest `phaseo login --scopes` with them added. Do not widen scopes silently or switch to another credential.

## Add Credits

`phaseo credits add` never charges on its own: a workspace owner or admin approves every top-up. It needs the opt-in `billing:write` scope, so ask the user before running `phaseo login --scopes billing:write` (it keeps the default scopes).

```bash
phaseo credits add --amount 20 --json
phaseo credits topups get <id> --json
```

- Amounts are $5 to $500. Only start a top-up the user asked for, with the amount they gave.
- With a saved card the owners and admins get an email; the command prints `awaiting confirmation` and waits (up to about 35 minutes). Use `--no-wait` to return at once, then poll `credits topups get` until `final` is `true`.
- Without a saved card the result has a `checkout_url`. Give it to the user to pay with a new card in the browser; never open or pay it yourself.
- `paid` means the credits were added. `declined`, `expired` and `failed` are final and carry a `reason` code: tell the user and stop. Do not retry them automatically or start another top-up in a loop.
- `429 too_many_pending_topups` means 5 top-ups are already waiting; do not create more.

## Agent Output Rules

- Always request `--json` when parsing or reasoning about output.
- Report request IDs and non-sensitive metadata, not bearer tokens or key material.
- Preserve workspace boundaries; never override `--workspace` without confirming the intended workspace.
- On `401`, run `phaseo whoami --json`, then reauthenticate if necessary.
- On `403`, inspect granted scopes and workspace membership; do not work around authorization.
- On `429`, respect `Retry-After` and back off.
- On `5xx`, capture the request ID and inspect `logs get` before retrying.
- Require explicit confirmation before destructive workspace, key, member, preset, or guardrail changes unless the user already requested that exact mutation.

## Validate Work

After changes, run the smallest relevant read-back plus:

```bash
phaseo whoami --json
```

For integration troubleshooting, also verify `https://api.phaseo.app/v1/health` and run one low-cost smoke request only when the user authorizes provider usage.
