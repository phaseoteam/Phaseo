# Phaseo MCP proof of concept

Authenticated, stateless MCP server for live Phaseo model, provider, pricing,
and workspace key-management information.

It reuses Phaseo's existing OAuth server and control-plane permissions rather
than creating a second account or API-key system.

## Authentication and permissions

`/mcp` requires a Phaseo OAuth access token. The Worker advertises protected
resource metadata at `/.well-known/oauth-protected-resource/mcp`, then validates
the bearer token through Phaseo's `/v1/me` endpoint. The OAuth `resource` value
must exactly match the MCP endpoint, preventing a token issued for another
connector from being accepted. Phaseo remains the enforcement point for token
scopes, revocation, and workspace role checks.

The initial authenticated tool set is:

- `api_keys_list` — requires `keys:read`; secrets are never returned.
- `api_key_create` — requires `keys:write` and an owner/admin role. The caller
  must explicitly set `confirm: true`; the new secret is returned exactly once.

When `PHASEO_THIRD_PARTY_OAUTH_ENABLED=true`, Phaseo advertises a dynamic client
registration endpoint from its OAuth metadata. A compatible MCP host can then
register its own callback URI, request only the scopes it needs, and send the
resulting Phaseo access token to this Worker. The initial registration allowlist
is deliberately narrow: identity, model catalogue, workspace read, and API-key
read/write scopes only.

The Phaseo CLI remains a fixed first-party client with device authorization,
short-lived JWT access tokens, and rotating refresh tokens. MCP hosts and
user-created third-party applications use authorization code plus PKCE and
receive a revocable opaque delegated key as their OAuth access token.

Do not use a Management API key as the MCP bearer token: it cannot authenticate
ordinary `/v1/models` or `/v1/keys` requests.

## Run locally

1. Copy `.dev.vars.example` to `.dev.vars` only when you need to point the MCP
   Worker at a local or preview Phaseo API. No static Phaseo API key is needed.
2. Run `pnpm --filter @phaseo/mcp dev`.
3. Connect MCP Inspector or another OAuth-capable MCP client to
   `http://localhost:8787/mcp`. The client discovers Phaseo OAuth, registers a
   public client, opens the consent screen, and echoes
   `resource=http://localhost:8787/mcp` through code exchange.

## Deploy preview

Deploy with `pnpm --filter @phaseo/mcp exec wrangler deploy`. The generated
`workers.dev` URL is suitable for MCP Inspector testing. Attach
`mcp.phaseo.app` only after the preview is validated.

The hosted API config enables `PHASEO_THIRD_PARTY_OAUTH_ENABLED`. Before
enabling a public ChatGPT app, apply the OAuth resource-binding migration and
validate the complete authorization-code flow with MCP Inspector. Keep the
scope and workspace-role checks in place for every write tool.
