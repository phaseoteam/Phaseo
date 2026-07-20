# OAuth and MCP hardening review

## Current design

Phaseo uses one OAuth authorization server for the dashboard, CLI, MCP hosts,
and third-party applications. The CLI is a fixed first-party device client;
MCP hosts and third-party applications use authorization code with S256 PKCE.
Dynamic client registration remains optional and is controlled by
`PHASEO_THIRD_PARTY_OAUTH_ENABLED`.

The public MCP server is permanently read-only. It exchanges an MCP
resource-bound bearer token through the confidential token-exchange endpoint,
then calls the Phaseo API with a short-lived, resource-specific upstream JWT.
It never forwards the original bearer token to normal API routes.

## Controls

- The protected-resource URL and token-exchange resource are exact-match
  values, preventing token replay at another resource server.
- The API and MCP Workers share a high-entropy
  `PHASEO_MCP_RESOURCE_SERVER_SECRET`, stored only as a Wrangler secret.
- OAuth grants are scoped. MCP metadata and tools advertise only read scopes;
  `gateway:access` is not part of the initial MCP consent request.
- Tools are registered only when the exchanged token holds every required
  scope, and all advertise `readOnlyHint: true`.
- Secrets, mutation operations, action approvals, and one-time reveal flows
  are absent from the MCP surface.
- Control-plane read results exclude API-key, management-key, OAuth-client,
  and webhook signing secrets.

## Verification

Use MCP Inspector to complete an OAuth login and inspect `tools/list`. Verify
that all available tools are read-only and that protected-resource metadata
contains only `*:read` scopes. Separately validate CLI device authorization and
third-party authorization-code flows against the same OAuth service.
