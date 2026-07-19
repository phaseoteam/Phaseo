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
| Workspaces and members | `workspaces:read/write/delete` | Feature-gated CRUD | CRUD |
| Gateway API keys | `keys:read/write/delete` | Feature-gated CRUD | CRUD |
| Presets | `presets:read/write/delete` | Feature-gated CRUD | CRUD |
| Workspace settings | `settings:read/write` | Feature-gated read/update | Read/update |
| Guardrails and assignments | `guardrails:read/write/delete` | Feature-gated CRUD | CRUD |
| Management keys | `management_keys:read/write/delete` | Feature-gated CRUD | CRUD |
| OAuth clients | `oauth_clients:read/write/delete` | Feature-gated CRUD | CRUD |
| Async webhook endpoints | `settings:read/write` | Feature-gated CRUD | CRUD |

MCP registers a tool only when the user's exchanged token contains the tool's
advertised scopes and the relevant write, destructive, or secret deployment
flag is enabled. Every mutation requires exact user confirmation. Webhook
mutations additionally require an owner or admin workspace role; reads require
workspace membership.

## Deliberate exclusions

- Inference routes are billable data-plane operations. They remain available
  through the normal API and SDKs, not as generic MCP proxy tools. The CLI raw
  API fallback can call them only when the user explicitly logs in with
  `gateway:access`.
- Internal health, cache invalidation, provider-deranking, and service-control
  routes require internal credentials and are not user tools.
- Leaked-key reporting is a purpose-built security endpoint rather than an
  account-management command.
- Secret-returning MCP writes remain independently disabled in production
  until Phaseo has a
  one-time secret delivery surface that is not model-readable. The CLI can
  perform these operations and hides secrets unless `--json` or
  `--show-secret` is explicit.

The CLI's `phaseo api get|post|put|patch|delete` command remains the forward-
compatible fallback for new public `/v1` routes while a dedicated command is
being added.
