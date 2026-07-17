# Phaseo MCP proof of concept

Authenticated, stateless MCP server for live Phaseo model, provider, pricing,
and workspace key-management information.

It reuses Phaseo's OAuth server and control-plane permissions rather than
creating a second identity or API-key system.

## Authentication and permissions

`/mcp` requires a Phaseo OAuth access token. The Worker advertises protected
resource metadata at `/.well-known/oauth-protected-resource/mcp`. The OAuth
`resource` value must exactly match the MCP endpoint.

The MCP bearer token is never forwarded to Phaseo's normal APIs. The Worker
exchanges it through the confidential `/oauth/mcp/token-exchange` endpoint for
a separate five-minute API JWT. Resource-bound MCP tokens are rejected by
ordinary Phaseo API routes, preventing cross-service replay and OAuth token
passthrough.

The read-only tool set mirrors the user-facing Phaseo control plane where an
agent can operate safely:

- account identity and workspace membership
- models, organisations, providers, endpoint families, and pricing
- credits, activity, analytics, request logs, and generation metadata
- workspaces and members
- Gateway API key metadata without key secrets
- presets, settings, guardrails, and guardrail assignments
- management-key and OAuth-client metadata without secrets
- webhook endpoint metadata where Batch API access is enabled

Tools are registered only when the exchanged token contains every scope that
the tool advertises. Billable inference endpoints and internal health/control
routes are intentionally not represented as generic MCP proxy tools.

The maintained API/MCP/CLI coverage matrix is in
[`docs/security/mcp-cli-api-parity.md`](../../docs/security/mcp-cli-api-parity.md).

CRUD tools are compiled in but disabled by default. Tool registration uses
three independent deployment controls:

- `PHASEO_MCP_WRITE_TOOLS_ENABLED=true` enables ordinary create/update and
  assignment tools.
- `PHASEO_MCP_DESTRUCTIVE_TOOLS_ENABLED=true` additionally enables delete,
  member-removal, and assignment-removal tools.
- `PHASEO_MCP_SECRET_TOOLS_ENABLED=true` additionally enables API-key,
  management-key, OAuth-secret, and webhook-secret operations. Generated
  secrets are encrypted by the API and delivered through a Phaseo-hosted,
  user-only, one-time reveal page; they are never returned to the model.

Every tool also requires its exact OAuth `*:write` or `*:delete` scope. A first
call prepares a ten-minute action ticket and returns a Phaseo approval URL. The
authenticated user must approve the exact tool, target, payload, client, and
workspace in Phaseo before a single-use execution token can be consumed. The
model-supplied `confirm: true` field is retained as UX intent, not trusted as
the authorization boundary.

When `PHASEO_THIRD_PARTY_OAUTH_ENABLED=true`, Phaseo advertises dynamic client
registration. Registrations default to the read-only scope set; write scopes
and `gateway:access` are rejected for unverified dynamically registered
clients. Elevated access requires an explicitly trusted, developer-owned or
first-party OAuth client.

The Phaseo CLI remains a fixed first-party client with device authorization,
short-lived JWT access tokens, and rotating refresh tokens. MCP hosts and
user-created third-party applications use authorization code plus strict S256
PKCE. Delegated API credentials expire after seven days and are revocable.

## Required secrets

Set the same randomly generated value (at least 64 characters) as the Wrangler
secret `PHASEO_MCP_RESOURCE_SERVER_SECRET` on both the API Worker and the MCP
Worker. Do not put it in `wrangler.jsonc`, `.dev.vars.example`, logs, or source.

Before secret-returning tools can be enabled, configure a separate randomly
generated Wrangler secret of at least 32 characters named
`MCP_SECRET_REVEAL_ENCRYPTION_KEY` on the API Worker. Do not reuse the OAuth
token pepper, webhook encryption key, or MCP resource-server secret.

Production also uses a Cloudflare Service Binding named `PHASEO_API` to reach
the `phaseo-gateway` Worker without traversing the public internet.

## Run locally

1. Copy `.dev.vars.example` to `.dev.vars` and replace the placeholder with a
   random local secret. Configure the identical secret for the local API.
2. Run the API and MCP Workers with their normal development commands.
3. Connect MCP Inspector to `http://localhost:8787/mcp` (or the MCP port shown
   by Wrangler).
4. Complete Phaseo login and consent. The client must echo the exact local MCP
   URL in `resource` at authorization and token exchange.

Run validation with:

```bash
pnpm --filter @phaseo/mcp cf-typegen
pnpm --filter @phaseo/mcp typecheck
pnpm --filter @phaseo/mcp test
pnpm --filter @phaseo/mcp build
```

## Deploy

Preview deployments use the separate `phaseo-mcp-preview` Worker from the
top-level Wrangler environment. Production uses:

```bash
pnpm --filter @phaseo/mcp exec wrangler deploy --env production
```

The production environment disables `workers.dev`, binds the custom domain
`mcp.phaseo.app`, and connects privately to `phaseo-gateway`. Apply the OAuth
resource-binding migration and configure the shared exchange secret before the
first deployment.

The production launch order, smoke tests, rollback steps, and current external
gates are tracked in
[`docs/security/oauth-mcp-launch-checklist.md`](../../docs/security/oauth-mcp-launch-checklist.md).
