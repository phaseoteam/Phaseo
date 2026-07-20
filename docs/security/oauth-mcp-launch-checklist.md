# OAuth and read-only MCP launch checklist

Phaseo MCP is an authenticated, stateless, permanently read-only integration.
Administrative actions belong to the dashboard, CLI, and Management API.

## Before deployment

- Confirm `https://mcp.phaseo.app/mcp` is the protected resource URL and
  `https://api.phaseo.app/oauth` is its authorization server.
- Install the same high-entropy `PHASEO_MCP_RESOURCE_SERVER_SECRET` on the API
  and MCP Workers. Keep it out of source, local examples, and logs.
- Verify the MCP Worker has the `PHASEO_API` service binding to
  `phaseo-gateway` and the production custom domain route.
- Verify the OAuth client supports authorization code plus S256 PKCE, and the
  CLI client supports device authorization.
- Keep dynamic client registration gated by
  `PHASEO_THIRD_PARTY_OAUTH_ENABLED`; unverified clients may request only the
  documented read-only scopes.

## Validate

```bash
pnpm --filter @phaseo/mcp cf-typegen
pnpm --filter @phaseo/mcp typecheck
pnpm --filter @phaseo/mcp test
pnpm --filter @phaseo/gateway-api typecheck
pnpm --filter @phaseo/web typecheck
```

- Inspect `/.well-known/oauth-protected-resource/mcp`; its
  `scopes_supported` must contain only `*:read` scopes and omit
  `gateway:access`.
- Connect MCP Inspector, complete OAuth consent, and verify `tools/list`
  exposes only tools annotated `readOnlyHint: true`.
- Verify metadata endpoints, read tools, CLI device login, and third-party
  authorization-code login continue to work.
- Verify `/oauth/mcp/action-approval/*` and `/oauth/mcp/secret-reveal/*`
  return `404`; those retired endpoints must not be reintroduced.

## Deployment and rollback

1. Deploy the API Worker, then the MCP Worker.
2. Apply the forward-only migration removing dormant MCP mutation tables.
3. Delete the retired `MCP_SECRET_REVEAL_ENCRYPTION_KEY` API Worker secret.
4. Confirm health endpoints and protected-resource metadata.

Rollback is a source deployment rollback. Do not re-add mutation endpoints or
secret-reveal storage as part of an MCP rollback; use the Management API, CLI,
or dashboard for administrative operations.
