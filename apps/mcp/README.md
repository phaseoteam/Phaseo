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

The OAuth client used by an MCP host must be registered with Phaseo and request
at least `openid profile email me:read keys:read keys:write`. A production
ChatGPT app additionally needs Phaseo's OAuth client-registration flow enabled
for the host callback URLs. Do not use a Management API key as the MCP bearer
token: it cannot authenticate ordinary `/v1/models` or `/v1/keys` requests.

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

Before enabling a public ChatGPT app, configure Phaseo OAuth dynamic client
registration (or a Cloudflare OAuth-provider adapter) so the host's callback
URLs can be registered safely. Do not deploy write tools until that flow,
consent screen, and audit logging are reviewed.
