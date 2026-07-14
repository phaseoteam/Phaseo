# Phaseo MCP proof of concept

Authenticated, stateless MCP server for live Phaseo model, provider, pricing,
and workspace key-management information.

It reuses Phaseo's existing OAuth server and control-plane permissions rather
than creating a second account or API-key system.

## Authentication and permissions

`/mcp` requires a Phaseo OAuth access token. The Worker advertises protected
resource metadata at `/.well-known/oauth-protected-resource/mcp`, then validates
the bearer token through Phaseo's `/v1/me` endpoint. Phaseo remains the
enforcement point for token scopes and workspace role checks.

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

Do not use a Management API key as the MCP bearer token: it cannot authenticate
ordinary `/v1/models` or `/v1/keys` requests.

## Run locally

1. Copy `.dev.vars.example` to `.dev.vars`. `PHASEO_API_TOKEN` is optional and
   only useful for an anonymous catalogue preview; production connections use
   the OAuth bearer token supplied by the MCP client.
2. Run `pnpm --filter @phaseo/mcp dev`.
3. Connect an MCP client to `http://localhost:8787/mcp` and complete the
   Phaseo OAuth flow using a registered OAuth client.

## Deploy preview

Deploy with `pnpm --filter @phaseo/mcp exec wrangler deploy`. The generated
`workers.dev` URL is suitable for MCP Inspector testing. Attach
`mcp.phaseo.app` only after the preview is validated.

Before enabling a public ChatGPT app, set
`PHASEO_THIRD_PARTY_OAUTH_ENABLED=true` in the API Worker and validate the
complete authorization-code flow with MCP Inspector. Do not deploy write tools
until the consent screen and audit logging are reviewed.
