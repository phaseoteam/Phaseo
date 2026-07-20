# Phaseo MCP proof of concept

Authenticated, stateless, read-only MCP server for live Phaseo model,
provider, pricing, and workspace information.

It reuses Phaseo's OAuth server and control-plane permissions rather than
creating a second identity or API-key system. Administrative operations remain
available through the Phaseo dashboard, CLI, and Management API.

## Authentication and permissions

`/mcp` requires a Phaseo OAuth access token. The Worker advertises protected
resource metadata at `/.well-known/oauth-protected-resource/mcp`. The OAuth
`resource` value must exactly match the MCP endpoint.

The MCP bearer token is never forwarded to Phaseo's normal APIs. The Worker
exchanges it through the confidential `/oauth/mcp/token-exchange` endpoint for
a separate five-minute API JWT. Resource-bound MCP tokens are rejected by
ordinary Phaseo API routes, preventing cross-service replay and OAuth token
passthrough.

All MCP tools are permanently read-only. They provide:

- account identity and workspace membership
- models, organisations, providers, endpoint families, and pricing
- credits, activity, analytics, request logs, and generation metadata
- workspaces and members
- Gateway API-key metadata without key secrets
- presets, settings, guardrails, management-key and OAuth-client metadata
- webhook endpoint metadata where Batch API access is enabled

Tools are registered only when the exchanged token contains every advertised
read scope. Billable inference endpoints, secret values, and control-plane
mutations are intentionally not represented as MCP tools.

When `PHASEO_THIRD_PARTY_OAUTH_ENABLED=true`, Phaseo advertises dynamic client
registration. Registrations default to the read-only scope set; write scopes
and `gateway:access` are rejected for unverified dynamically registered
clients. The Phaseo CLI remains a fixed first-party client with device
authorization, while MCP hosts and third-party applications use authorization
code with S256 PKCE.

## Required secret

Set the same randomly generated value (at least 64 characters) as the Wrangler
secret `PHASEO_MCP_RESOURCE_SERVER_SECRET` on both the API Worker and the MCP
Worker. Do not put it in `wrangler.jsonc`, `.dev.vars.example`, logs, or
source.

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
