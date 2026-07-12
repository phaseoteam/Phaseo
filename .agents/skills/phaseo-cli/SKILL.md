---
name: phaseo-cli
description: Operate and troubleshoot Phaseo through the official `phaseo` CLI. Use when installing or updating the CLI, authenticating with browser or device OAuth, managing API keys/workspaces/presets/guardrails, inspecting credits and analytics, investigating gateway requests by request ID, or automating Phaseo control-plane work with structured JSON output.
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

3. Use `phaseo api <method>` only when no polished subcommand exists. Keep paths under `/v1`; the CLI supplies authentication.

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
