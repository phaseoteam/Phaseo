---
"@phaseo/gateway-api": minor
"@phaseo/web-api": patch
"@phaseo/sdk": minor
---

Add `/v1` management routes for settings that were dashboard-only, so the CLI, MCP server and SDKs can manage a workspace without the web dashboard:

- `GET /v1/rate-limits/tier` and `POST /v1/rate-limits/tier/raise` accept OAuth tokens. Owners and admins see the tier; only the workspace owner can raise. Management keys can read the tier but never raise.
- `POST /v1/invites/accept` asks to join a workspace with an invite code, and `GET /v1/invites/requests` lists your join requests (OAuth users only).
- `GET`/`PATCH /v1/routing/auto` for auto-routing limits, and `GET`/`PUT`/`DELETE /v1/routing/successor/replacements` for successor model replacements.
- `POST /v1/observability/destinations/test`, `/{id}/test` and `/{id}/sample` check a destination and send a sample trace.
- `GET /v1/me/authorized-apps`, `PATCH` (remove scopes only) and `DELETE` (revoke) `/v1/me/authorized-apps/{id}`, and `GET`/`PATCH /v1/me/profile` (OAuth users only).
- `PATCH /v1/keys/{id}` sets `ip_allowlist`, and keys return it.

The OpenAPI spec now also documents `/v1/me` and `/v1/security/report-leaked-key`. The dashboard and the API share one copy of the auto-routing, successor replacement and IP allowlist validation, and one sample trace.
