# Phaseo OAuth and MCP launch checklist

Date prepared: 2026-07-17

This checklist covers the first public, authenticated, read-only Phaseo MCP
release. `PHASEO_MCP_WRITE_TOOLS_ENABLED` must remain `false` throughout this
launch.

## Current readiness

- [x] MCP Worker is stateless and uses Streamable HTTP at `/mcp`.
- [x] OAuth authorization code flow requires S256 PKCE and binds the access
  credential to the exact MCP resource URL.
- [x] MCP bearer tokens are exchanged confidentially for a separate five-minute
  upstream API token; they are not forwarded to ordinary Phaseo API routes.
- [x] Protected-resource metadata, OAuth challenges, per-tool OAuth metadata,
  output schemas, and accurate read/write annotations are present.
- [x] Default dynamic-client scopes are read-only and do not include
  `gateway:access` or `keys:write`.
- [x] Local API and MCP development secrets exist, match, and are at least 64
  characters long.
- [x] Supabase local and production migration histories are aligned.
- [x] `PHASEO_MCP_RESOURCE_SERVER_SECRET` is installed on the production API
  Worker.
- [x] The production `phaseo-mcp` Worker has the identical secret.
- [x] `mcp.phaseo.app` resolves and the production discovery, health, and OAuth
  challenge endpoints are verified.
- [ ] Complete external MCP Inspector and ChatGPT developer-mode tests.

## Hard launch gates

### 1. Database history and migration

History was reconciled on 2026-07-17. Three production-only migrations were
recovered from `supabase_migrations.schema_migrations` and committed to Git.
Two local migrations with duplicate timestamps were assigned unique versions.

Production's earlier history had already been treated as a baseline: some
versions were recorded even though their feature objects were absent. Replaying
all later local-only feature migrations failed safely on the first missing
prerequisite and made clear that doing so would introduce unrelated production
features. Those historical/deferred versions were therefore recorded as part
of the existing baseline without executing their SQL. The OAuth
resource-binding migration was then applied normally and
`supabase db push --dry-run` reported the remote database up to date.

The launch migration intentionally retains the existing nine-argument,
gateway-only issuance function for a zero-downtime rollout. Add a later cleanup
migration that drops the old signature after the resource-aware API has been
stable in production.

Verify after application:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('keys', 'oauth_authorization_codes')
  and column_name in ('oauth_resource', 'resource');

select count(*) as active_unbounded_delegated_keys
from public.keys
where key_kind = 'oauth_delegated'
  and status = 'active'
  and expires_at is null;
```

Expected: both columns exist and the active unbounded count is zero.

### 2. Shared resource-server secret

Use one randomly generated value of at least 64 characters. Configure the same
value in both Workers; never place it in source, Wrangler variables, command
history, tickets, or logs.

```powershell
pnpm --filter @phaseo/gateway-api exec wrangler secret put PHASEO_MCP_RESOURCE_SERVER_SECRET --config wrangler.toml
pnpm --filter @phaseo/mcp exec wrangler secret put PHASEO_MCP_RESOURCE_SERVER_SECRET --env production
```

For the first MCP Worker deployment, Cloudflare requires the secret to be
supplied with `wrangler deploy --secrets-file <ignored-file>` because the Worker
does not yet exist for `secret put`.

Confirm presence by name only:

```powershell
pnpm --filter @phaseo/gateway-api exec wrangler secret list --config wrangler.toml
pnpm --filter @phaseo/mcp exec wrangler secret list --env production
```

### 3. Deployment order

1. Reconcile migration history and apply the resource-binding migration.
2. Set the production API secret.
3. Deploy `phaseo-gateway` with third-party OAuth enabled.
4. Deploy `phaseo-mcp` using the production Wrangler environment.
5. Set or confirm the identical MCP Worker secret immediately.
6. Confirm `mcp.phaseo.app` resolves to the production Worker.
7. Run the smoke tests below before announcing availability.

The production MCP deployment must have:

- `workers_dev = false`;
- custom domain `mcp.phaseo.app`;
- Service Binding `PHASEO_API -> phaseo-gateway`;
- `PHASEO_MCP_WRITE_TOOLS_ENABLED = false`;
- logs and sampled traces enabled.

## Production smoke tests

### Discovery and transport

```powershell
curl.exe -i https://mcp.phaseo.app/health
curl.exe -i https://mcp.phaseo.app/.well-known/oauth-protected-resource/mcp
curl.exe -i -X POST https://mcp.phaseo.app/mcp
curl.exe -i https://api.phaseo.app/oauth/.well-known/oauth-authorization-server
```

Expected:

- health returns `200`;
- protected-resource metadata names exactly
  `https://mcp.phaseo.app/mcp`;
- unauthenticated `/mcp` returns `401`, `Cache-Control: no-store`, and a
  `WWW-Authenticate` challenge pointing to protected-resource metadata;
- requested MCP scopes are only `models:read providers:read pricing:read
  keys:read`;
- OAuth metadata advertises authorization, token, registration, revocation,
  S256 PKCE, and public-client authentication support.

### End-to-end clients

- [ ] MCP Inspector completes dynamic registration, Phaseo login, consent,
  authorization-code exchange, and `tools/list`.
- [ ] `models_list`, `model_get`, `providers_list`, and `cost_estimate` return
  current data and schema-valid `structuredContent`.
- [ ] `api_keys_list` returns metadata only and never a key secret.
- [ ] A token issued for another `resource` is rejected.
- [ ] A resource-bound MCP token is rejected by ordinary `/v1/*` API routes.
- [ ] Revocation immediately prevents MCP token exchange.
- [ ] Phaseo CLI device login, refresh, `whoami`, and logout still succeed.
- [ ] A normal third-party, unbound OAuth application still requires
  `gateway:access` and can call its allowed Phaseo API routes.
- [ ] ChatGPT developer mode discovers the read-only tools and completes login.
- [ ] `api_key_create` is absent from `tools/list` in production.

## Submission and operational preparation

- [ ] Reviewer/demo account has representative models, providers, and API-key
  metadata but no production secrets or customer data.
- [ ] Privacy policy: `https://phaseo.app/privacy`.
- [ ] Terms: `https://phaseo.app/terms`.
- [ ] Support: `https://phaseo.app/contact` and `support@phaseo.ai`.
- [ ] Prepare five positive prompts, three negative/non-trigger prompts,
  screenshots, a logo, country availability, and release notes.
- [ ] Confirm OAuth and MCP logs redact Authorization headers, codes, tokens,
  client secrets, and newly generated API keys.
- [ ] Monitor token-exchange failures, OAuth rate limits, DCR volume, MCP error
  rate, latency, and Service Binding failures during the first 24 hours.
- [ ] Define inactive dynamic-client cleanup before opening DCR to high-volume
  automated registration.

## Rollback

1. Remove or disable the `mcp.phaseo.app` route, or roll the MCP Worker back to
   its previous Cloudflare version.
2. Set `PHASEO_THIRD_PARTY_OAUTH_ENABLED=false` and redeploy the API if public
   registration/authorization itself must be stopped. The first-party CLI path
   remains separate.
3. Revoke affected OAuth authorizations and delegated keys. Rotate
   `PHASEO_MCP_RESOURCE_SERVER_SECRET` if resource-server authentication might
   be exposed.
4. Do not roll back the additive database columns. They are safe to retain and
   removing them would invalidate already issued resource-bound credentials.
