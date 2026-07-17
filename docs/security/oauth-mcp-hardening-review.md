# Phaseo OAuth and MCP security review

Date: 2026-07-17

Scope: Phaseo OAuth authorization server, consent UI, delegated credentials,
CLI login/session handling, MCP Worker, Cloudflare deployment configuration,
and the resource-binding database migration on
`feat/mcp-readonly-poc-20260711`.

This is a source-level review. Cloudflare account controls, deployed secrets,
WAF/rate-limit rules, Supabase production policies, DNS, and live HTTP headers
must still be verified in the deployed environment.

## Summary

No unresolved critical finding remains in the production-default
configuration after this pass. One high-risk capability, returning a newly
created API-key secret through an MCP tool, remains compiled in but is disabled
by default and is not considered safe for public enablement yet.

## Findings and remediation

### PHASEO-MCP-001 â€” OAuth token passthrough

- Severity: High
- Status: Resolved
- Location: `apps/mcp/src/phaseo-api.ts:147`,
  `apps/api/src/routes/oauth.ts:811`, `apps/api/src/lib/oauth/service.ts:327`
- Evidence: The earlier MCP flow validated the client bearer through `/v1/me`
  and reused that bearer for downstream Phaseo calls. MCP authorization rules
  explicitly forbid forwarding the resource token to an upstream API.
- Impact: A resource token could cross audience boundaries, weakening the
  confused-deputy protection provided by the OAuth `resource` parameter.
- Fix: The MCP Worker now authenticates as a confidential resource server and
  exchanges the subject token for a separate five-minute `phaseo-api` JWT. In
  production, downstream calls use a Cloudflare Service Binding.
- Mitigation: Rotate `PHASEO_MCP_RESOURCE_SERVER_SECRET` on a documented
  schedule and monitor exchange failures.
- False-positive notes: None; the original request path forwarded the same
  bearer value.

### PHASEO-OAUTH-002 â€” MCP-audience token accepted by normal API routes

- Severity: High
- Status: Resolved
- Location: `apps/api/src/pipeline/before/auth.ts:202`,
  `apps/api/src/pipeline/before/auth.ts:539`
- Evidence: Delegated keys carried `oauth_resource`, but normal API
  authentication did not reject a non-null resource binding.
- Impact: A stolen MCP token could be replayed directly against Phaseo API
  routes, bypassing the MCP resource-server boundary.
- Fix: Resource-bound opaque credentials now fail closed on normal API routes.
  Only the confidential token-exchange and OAuth userinfo paths explicitly
  allow validation of such credentials.
- Mitigation: Keep the allow option private to authorization-server endpoints.
- False-positive notes: Unbound third-party API credentials remain valid for
  their intended Phaseo API use.

### PHASEO-MCP-003 â€” Secret-bearing key creation tool

- Severity: High
- Status: Mitigated by secure default; intentionally not enabled for production
- Location: `apps/mcp/src/index.ts:184`, `apps/mcp/wrangler.jsonc:15`
- Evidence: `api_key_create` returns the one-time Gateway key secret in MCP
  structured output, which makes it model- and conversation-visible.
- Impact: The secret may be retained by the MCP host, model provider, logs, or
  conversation export.
- Fix: The tool is omitted unless the deployment explicitly sets
  `PHASEO_MCP_WRITE_TOOLS_ENABLED=true` and the user granted `keys:write`.
  Production configuration sets it to `false` and does not advertise the write
  scope.
- Mitigation: Build a one-time Phaseo-hosted secret delivery page or widget
  whose secret is not returned in model-readable content before enabling it.
- False-positive notes: Explicit user confirmation reduces accidental use but
  does not remove secret egress from the model context.

### PHASEO-OAUTH-004 â€” Incomplete PKCE syntax validation

- Severity: Medium
- Status: Resolved
- Location: `apps/api/src/lib/oauth/service.ts:831`,
  `apps/api/src/routes/oauth.ts:415`, `apps/api/src/routes/oauth.ts:752`
- Evidence: The prior implementation accepted any non-empty verifier and
  challenge before performing S256 comparison.
- Impact: Non-conforming clients and undersized verifier entropy could enter
  the authorization flow.
- Fix: Authorization challenges must be 43-character base64url SHA-256 values;
  verifiers must use the RFC 7636 unreserved alphabet and be 43â€“128 characters.
- Mitigation: None required beyond retaining regression tests.
- False-positive notes: Challenge equality itself is not a secret comparison;
  the important control is verifier entropy and exact S256 derivation.

### PHASEO-OAUTH-005 â€” Unvalidated denial redirect fallback

- Severity: Medium
- Status: Resolved
- Location: `apps/web/src/app/(auth)/oauth/consent/actions.ts:245`,
  `apps/web/src/app/(auth)/oauth/consent/actions.ts:310`
- Evidence: The legacy deny action could construct a redirect from a submitted
  absolute URL without independently proving it belonged to the OAuth client.
- Impact: An authenticated browser could be used as an open-redirect step in a
  phishing or OAuth confusion flow.
- Fix: The action now requires an authenticated user, active client, and exact
  registered redirect URI. The CLI exception is restricted to an exact
  loopback `/callback` URL.
- Mitigation: The browser continues to reject credentials, fragments, non-HTTPS
  remote destinations, and non-loopback HTTP URLs.
- False-positive notes: The page had already validated normal requests, but a
  Server Action must enforce its own boundary.

### PHASEO-OAUTH-006 â€” Over-privileged and unsanitized dynamic registration defaults

- Severity: Medium
- Status: Resolved
- Location: `apps/api/src/routes/oauth.ts:62`,
  `apps/api/src/routes/oauth.ts:177`, `apps/api/src/routes/oauth.ts:301`
- Evidence: Registration defaulted to the full MCP allowlist, including
  `keys:write`, and accepted control characters in display metadata.
- Impact: Clients could begin consent with unnecessary write access; malicious
  metadata could create misleading consent rendering or log entries.
- Fix: Default DCR scopes are the minimum read-only MCP set. They exclude both
  `gateway:access` and `keys:write`; write or inference scopes require an
  explicit request. Names/descriptions are normalized, bounded, and reject
  control characters; URLs and OAuth parameters are also length-bounded.
- Mitigation: Continue HTML escaping client metadata in the consent UI.
- False-positive notes: React already escaped metadata; normalization is
  defense in depth and protects non-HTML consumers too.

### PHASEO-OAUTH-007 â€” Long-lived delegated bearer credentials

- Severity: Medium
- Status: Resolved for newly issued credentials
- Location: `apps/api/src/lib/oauth/service.ts:658`,
  `supabase/migrations/20260717113000_bind_oauth_keys_to_resources.sql`
- Evidence: OAuth-managed Gateway keys previously had no explicit expiry.
- Impact: Theft could provide access until manual revocation or authorization
  removal.
- Fix: Newly issued delegated access credentials expire after seven days and
  return `expires_in` to clients. The launch migration backfills active legacy
  delegated credentials to a seven-day expiry.
- Mitigation: Verify the post-migration active unbounded count is zero.
- False-positive notes: CLI JWT access tokens were already short-lived and use
  rotating refresh tokens.

### PHASEO-DB-008 — Rolling-deployment compatibility overload

- Severity: Low
- Status: Accepted temporarily for zero-downtime rollout
- Location:
  `supabase/migrations/20260717113000_bind_oauth_keys_to_resources.sql`
- Evidence: The previous nine-argument overload remains available to the
  currently deployed API while the resource-aware overload is introduced.
- Impact: Privileged application code can still mint an unbound delegated key,
  but the database requires `gateway:access` for that path and grants execute
  only to `service_role`.
- Fix: The new API calls the resource-aware overload. Retaining the constrained
  old signature avoids an OAuth outage between the migration and API deploy.
- Mitigation: Drop the old signature in a follow-up migration after every API
  instance has been upgraded.
- False-positive notes: The compatibility path cannot mint a low-scope MCP
  credential and does not weaken resource-bound token enforcement.

### PHASEO-CF-009 â€” Production Worker exposure and binding posture

- Severity: Low
- Status: Resolved in configuration; deployment verification required
- Location: `apps/mcp/wrangler.jsonc:20`, `apps/mcp/wrangler.jsonc:24`
- Evidence: The preview-only configuration exposed `workers.dev` and called the
  public API URL.
- Impact: A production alias could bypass custom-domain controls, and
  Worker-to-Worker traffic unnecessarily traversed the public endpoint.
- Fix: The production environment disables `workers.dev`, binds
  `mcp.phaseo.app`, uses a `PHASEO_API` Service Binding, enables sampled traces,
  and keeps write tools off. Preview retains `workers.dev` intentionally.
- Mitigation: Verify the deployed environment is `production`, not the
  top-level preview environment.
- False-positive notes: Top-level `workers_dev=true` is deliberate for local
  proof-of-concept testing.

### PHASEO-WEB-010 â€” Consent clickjacking and baseline headers

- Severity: Low
- Status: Resolved in application configuration; verify at the edge
- Location: `apps/web/next.config.mjs:67`
- Evidence: No repository-visible frame policy specifically protected the OAuth
  consent route.
- Impact: An attacker could attempt UI redressing if edge headers were absent.
- Fix: The app now sets baseline `nosniff`, framing, referrer, and permissions
  headers; `/oauth/consent` adds `frame-ancestors 'none'`.
- Mitigation: Confirm Cloudflare does not remove or replace these headers.
- False-positive notes: Equivalent edge headers may already exist but were not
  visible in source.

### PHASEO-MCP-011 — Missing machine-readable tool contracts

- Severity: Medium
- Status: Resolved
- Location: `apps/mcp/src/index.ts`
- Evidence: Tools returned `structuredContent` without declaring matching
  output schemas and did not expose per-tool OAuth requirements.
- Impact: Hosts could not validate tool output reliably or request the minimum
  authorization needed for each operation.
- Fix: Every tool now declares an exact output schema, OAuth security metadata,
  and complete read-only/destructive/idempotent/open-world annotations. Server
  instructions also direct hosts to use live data and confirm writes.
- Mitigation: Retain the in-memory `tools/list` regression tests.
- False-positive notes: Authentication already existed at the `/mcp` boundary;
  this finding concerned interoperability and least privilege.

## Residual risks and launch gates

1. Do not enable `PHASEO_MCP_WRITE_TOOLS_ENABLED` publicly until key secrets can
   be delivered outside model-readable MCP output.
2. Reconcile Supabase local/remote migration history before applying the launch
   migration, then verify its delegated-key expiry backfill completed.
3. Dynamic clients are rate-limited but do not yet have an expiry or automated
   inactive-client cleanup policy. Add one before high-volume public DCR.
4. The web app has a focused consent CSP, not a strict app-wide `script-src`
   policy. Roll out a nonce-based CSP in report-only mode before enforcement.
5. Verify deployed Cloudflare rate-limit bindings, secret presence, DNS/custom
   domain, Service Binding, log redaction, and production environment selection.
6. Run an external OAuth interoperability suite and MCP Inspector against the
   deployed endpoint; source tests cannot verify browser/provider behavior.

## Validation performed

- Focused API OAuth/auth/control test suites
- MCP unit tests, TypeScript checks, Wrangler type generation check, preview
  dry-run, and production dry-run
- Web TypeScript checks and production build
- CLI test suite and build
- Production dependency audit (`pnpm audit --prod --audit-level high`)
- `git diff --check`
