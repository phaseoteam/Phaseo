# AI Stats CLI and OAuth Beta Handoff

This package contains the first beta of the official `aistats` CLI. It is built on the shared AI Stats OAuth/OIDC layer rather than a CLI-only auth path, so the same foundations can support both first-party CLI login and future third-party "Sign in with AI Stats" apps.

## CLI Commands

```sh
aistats login
aistats whoami
aistats keys create --name "Codex"
aistats keys create --name "Codex" --json
aistats logout
```

All commands support `--json`. Pretty output hides newly-created API key secrets unless `--show-secret` is passed; JSON output includes the raw key once for agent workflows.

The CLI stores its session at `~/.config/aistats/session.json` with restrictive file permissions. Set `AI_STATS_CONFIG_DIR` to override this location for tests or agent sandboxes.

## OAuth/OIDC Beta Shape

The CLI uses the OAuth 2.0 Device Authorization Grant as the first-party `aistats_cli` client. Third-party beta apps use Authorization Code + PKCE with exact redirect URI matching.

Implemented API endpoints:

- `GET /oauth/authorize`
- `POST /oauth/authorize/approve`
- `POST /oauth/device/code`
- `POST /oauth/device/activate`
- `POST /oauth/token`
- `POST /oauth/revoke`
- `GET /oauth/userinfo`
- `GET /.well-known/openid-configuration`
- `GET /.well-known/jwks.json`

Supported grants:

- `urn:ietf:params:oauth:grant-type:device_code`
- `authorization_code` with required PKCE S256
- `refresh_token`

## Management API Integration

OAuth access tokens are accepted by selected management routes alongside existing management keys. The initial CLI flow uses:

- `GET /v1/me` for user and workspace introspection.
- `POST /v1/keys` for API key creation.

Creating keys with OAuth requires:

- A valid AI Stats OAuth access token.
- `keys:write` scope.
- A workspace-scoped grant/claim.
- Workspace `owner` or `admin` membership.

Existing management-key behavior remains supported.

## Production Setup Notes

Before enabling this outside beta, configure:

- `AI_STATS_OAUTH_PRIVATE_JWK`: RS256 private JWK used to sign AI Stats OAuth access tokens.
- `AI_STATS_OAUTH_TOKEN_PEPPER`: pepper used to hash refresh tokens, device codes, and authorization codes.
- `AI_STATS_WEB_BASE_URL`: web app base URL for device activation and consent redirects.

The migration `20260531120000_oauth_cli_device_and_pkce_beta.sql` adds OAuth client metadata, device codes, authorization codes, hashed refresh tokens, and user grants. It also seeds the first-party `aistats_cli` OAuth client.

## Current Beta Boundaries

- Dynamic client registration is intentionally out of scope.
- Third-party app registration remains beta/private through the existing OAuth app settings surface.
- Workspace selection is required because current AI Stats resource permissions are workspace-scoped.
- Confidential-client token auth is not fully productized yet; the beta path is public clients with PKCE/device flow.

## Useful Validation Commands

```sh
pnpm --filter @ai-stats/gateway-api typecheck
pnpm --filter @ai-stats/web typecheck
pnpm --filter @ai-stats/cli build
pnpm --filter @ai-stats/cli test
cd apps/api && pnpm exec vitest run src/lib/oauth/service.test.ts src/pipeline/before/auth.management.test.ts
pnpm --filter @ai-stats/gateway-api build
```
