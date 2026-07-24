# Phaseo API, MCP, and CLI parity

This document records which public API capabilities are intentionally exposed
through Phaseo's MCP server and CLI. It prevents route additions from silently
creating authentication or tooling gaps.

## Supported control-plane surfaces

| Capability | API scope | MCP | CLI |
| --- | --- | --- | --- |
| Identity and current workspace | `me:read` | Read | `whoami` |
| Models and model lookup | `models:read` | Read | Read |
| Organisations and endpoint families | `models:read` | Read | Read |
| Providers | `providers:read` | Read | Read |
| Pricing catalogue and calculation | `pricing:read` | Read | Read |
| Credits | `credits:read` | Read | Read |
| Activity and request logs | `activity:read` | Read | Read |
| Analytics | `analytics:read` | Read | Read |
| Generation metadata | `generations:read` | Read | Read |
| Workspaces and members | `workspaces:read/write/delete` | Read | CRUD |
| Gateway API keys | `keys:read/write/delete` | Read metadata | CRUD |
| Presets | `presets:read/write/delete` | Read | CRUD |
| Workspace settings | `settings:read/write` | Read | Read/update |
| Guardrails and assignments | `guardrails:read/write/delete` | Read | CRUD |
| Management keys | `management_keys:read/write/delete` | Read metadata | CRUD |
| OAuth clients | `oauth_clients:read/write/delete` | Read metadata | CRUD |
| Async webhook endpoints | `settings:read/write` | Read metadata | CRUD |

MCP registers a tool only when the user's exchanged token contains every
advertised read scope. The public MCP surface is permanently read-only;
administrative operations are available through the dashboard, CLI, and
Management API. Webhook reads require workspace membership.

## Deliberate exclusions

- Inference routes are billable data-plane operations. They remain available
  through the normal API and SDKs, not as generic MCP proxy tools. The CLI raw
  API fallback can call them only when the user explicitly logs in with
  `gateway:access`.
- Internal health, cache invalidation, provider-deranking, and service-control
  routes require internal credentials and are not user tools.
- Leaked-key reporting is a purpose-built security endpoint rather than an
  account-management command.
- Secret-returning operations are deliberately excluded from MCP. The CLI can
  perform supported administrative operations and hides secrets unless `--json`
  or `--show-secret` is explicit.

The CLI's `phaseo api get|post|put|patch|delete` command remains the forward-
compatible fallback for new public `/v1` routes while a dedicated command is
being added.
