# Phaseo MCP CRUD security audit

Date: 2026-07-17  
Reviewed commit: `633a7df9e` (`feat/mcp): add scoped CRUD tools`)  
Branch: `feat/mcp-readonly-poc-20260711`

## Executive verdict

All nine findings identified against commit `633a7df9e` are remediated in the
current working tree. No Critical issue or direct OAuth/workspace authorization
bypass was identified. The implementation now provides least-privilege dynamic
registration, exact-payload user approvals, single-use execution tickets,
out-of-band secret reveal, mutation throttling and audit events, strict schemas,
error redaction, and actual-byte request limits.

The deployed MCP configuration remains **read-only**. Do **not** enable MCP CRUD
in production until the new migrations and encryption secret are installed and
the approval/reveal flow has passed staging browser testing.

### Finding summary

| ID | Severity | Finding | Current exposure |
|---|---|---|---|
| MCP-CRUD-001 | High | Authentication challenge requests the complete enabled scope bundle | Remediated locally; not deployed |
| MCP-CRUD-002 | High | `confirm: true` is not proof of human approval | Remediated locally; not deployed |
| OAUTH-CRUD-003 | High | Public DCR permits self-asserted identity plus destructive scopes | Remediated locally; migration not applied |
| MCP-SECRET-004 | High | One-time secrets are returned into model-visible structured content | Remediated locally; secret tools remain disabled |
| API-ERROR-005 | Medium | Raw backend errors can propagate to MCP callers | Remediated locally; not deployed |
| MCP-ABUSE-006 | Medium | Mutation tools lack dedicated throttling and idempotency protection | Remediated locally; not deployed |
| OPS-AUDIT-007 | Medium | No durable MCP/OAuth mutation audit trail was found | Remediated locally; migration not applied |
| MCP-SCHEMA-008 | Medium | Several update tools accept generic untyped change objects | Remediated locally; not deployed |
| MCP-DOS-009 | Low | The 1 MiB MCP body limit trusts `Content-Length` | Remediated locally; not deployed |

## Remediation update — 2026-07-17

All nine findings have corresponding code remediations in the current working
tree. Production has not been changed, and all mutation flags remain false.
CRUD must stay disabled until the three new migrations are applied and the
dedicated secret-reveal encryption key is installed.

| Finding | Remediation |
|---|---|
| MCP-CRUD-001 | Initial `WWW-Authenticate` now requests only the read-only baseline; elevated scopes are not silently bundled. |
| MCP-CRUD-002 | Every mutation now requires a Phaseo-hosted, exact-payload human approval and a ten-minute, single-use execution token bound to user, workspace, OAuth client, tool, method, path, payload, and scopes. |
| OAUTH-CRUD-003 | Public DCR rejects `gateway:access`, write, and delete scopes; a migration revokes existing elevated dynamic grants/keys; consent uses an authenticated trust lookup, blocks remote logos, labels dynamic clients as unverified, and requires acknowledgement. |
| MCP-SECRET-004 | Generated secrets are redacted before MCP output, encrypted with a dedicated API secret, and shown through a user-only one-time reveal page. Secret action preparation fails closed if encryption is not configured. |
| API-ERROR-005 | MCP redacts every upstream 5xx detail, and the audited OAuth/control-plane routes now return generic correlation IDs while logging server-side diagnostics. |
| MCP-ABUSE-006 | Preparation and consumption are identity/workspace/tool rate limited; execution tickets are single-use and reject altered or replayed requests. |
| OPS-AUDIT-007 | `mcp_action_audit_events` records prepared, approved, consumed, succeeded, and failed lifecycle events without payloads or secrets. |
| MCP-SCHEMA-008 | Generic mutation patches were replaced by strict per-resource schemas, bounded objects, enumerated fields, and traversal-safe identifiers. |
| MCP-DOS-009 | MCP requests are now streamed through an actual-byte 1 MiB limit before authentication or JSON parsing, including requests without `Content-Length`. |

Deployment prerequisites:

1. apply migrations `20260717180000`, `20260717181000`, and `20260717182000`;
2. install `MCP_SECRET_REVEAL_ENCRYPTION_KEY` on the API Worker before enabling secret tools;
3. deploy API and web before MCP;
4. complete a staging browser/MCP approval and one-time secret-reveal test;
5. enable ordinary, destructive, and secret flags separately only after their corresponding smoke tests pass.

## Scope and methodology

The review covered:

- MCP authentication, tool registration, feature flags, schemas, annotations, error handling, and API proxying;
- OAuth dynamic client registration, authorization consent, PKCE, code exchange, MCP token exchange, scope and resource binding;
- control-plane API capability and workspace-role enforcement;
- secret creation and return paths;
- webhook SSRF and secret-encryption controls;
- deployment defaults, tracked secret hygiene, dependency advisories, and targeted security tests.

This was a source-level and local-test audit. It did not inspect Cloudflare account settings, WAF rules, production log destinations, live Worker secrets, Supabase RLS/policies outside the repository, or perform an adversarial test against production.

## Detailed findings

### MCP-CRUD-001 — Complete enabled scope bundle in the authentication challenge

Severity: **High**  
Status: **Remediated in the working tree; production remains gated**

Evidence:

- `apps/mcp/src/index.ts:613-619` constructs `enabledMcpScopes()` by concatenating every read scope, every write scope, and every delete scope as flags are enabled.
- `apps/mcp/src/index.ts:632-639` places that entire list in the `WWW-Authenticate` challenge.
- `apps/mcp/src/mutation-tools.ts:57-74` shows the bundle spans workspaces, Gateway keys, presets, settings, guardrails, management keys, and OAuth clients.

Impact:

When CRUD flags are enabled, a client following the challenge can ask the user for an account-wide administrative grant even if the immediate task needs only one narrow capability. Compromise or prompt injection in that client would then have a much larger blast radius than necessary.

Required fix:

- Keep the default MCP endpoint/read client read-only.
- Use incremental authorization or a separate administrative MCP endpoint/client with an intentionally selected scope profile.
- Do not put every supported scope in the challenge's required `scope` value. Advertise supported scopes in protected-resource metadata, but challenge for the minimum baseline needed to connect.
- Prefer task-specific grants, such as `presets:write`, over a single all-control-plane grant.

Compensating control: all production mutation flags are false in `apps/mcp/wrangler.jsonc:35-39`.

False-positive note: an MCP host may independently reduce the requested scopes. The Phaseo server should not rely on every host doing so because its own challenge currently presents the full bundle as required.

### MCP-CRUD-002 — Model-supplied confirmation is not a security boundary

Severity: **High**  
Status: **Remediated in the working tree; production remains gated**

Evidence:

- `apps/mcp/src/mutation-tools.ts:29-30` defines confirmation as `z.literal(true)`.
- `apps/mcp/src/mutation-tools.ts:345` instructs the model to call only after confirmation.
- `apps/mcp/src/mutation-tools.ts:356-369` executes the API request once schema validation passes; there is no server-issued approval artifact bound to the actor, operation, target, payload, and expiry.

Impact:

The model or an MCP caller can populate `confirm: true` itself. A prompt-injection payload, confused client, or buggy agent can therefore satisfy the check without a verifiable human approval. Tool annotations improve host UX but are advisory and are not a server-side authorization proof.

Required fix:

Implement a two-step mutation protocol:

1. a proposal tool returns a short-lived, single-use action token;
2. the confirmation tool accepts that token and verifies an HMAC/signature binding the user, OAuth client, workspace, tool, target, exact normalized payload hash, expiry, and nonce.

For destructive changes, require an explicit host interaction or Phaseo-hosted confirmation page before issuing the token. Keep proposal and execution responses free of secrets.

Compensating controls: accurate `destructiveHint` annotations and disabled production write/destructive flags.

False-positive note: ChatGPT or another host may always display a native confirmation dialog for destructive tools. That protects users of that host, but it does not protect the MCP endpoint from other compliant or custom clients.

### OAUTH-CRUD-003 — Unverified DCR identity can request destructive scopes

Severity: **High**  
Status: **Remediated in the working tree; migration not yet applied**

Evidence:

- `apps/api/src/routes/oauth.ts:49-82` permits dynamically registered clients to request write and delete scopes.
- `apps/api/src/routes/oauth.ts:318-356` accepts a self-asserted name, description, logo, and homepage, then records the client as `beta_status: "public"` and active without an ownership/brand verification step.
- `apps/api/wrangler.toml:32` enables third-party OAuth in the deployed API configuration.
- `apps/web/src/components/(gateway)/oauth/ConsentForm.tsx:404-445` prominently displays that name and remote logo.
- `apps/web/src/components/(gateway)/oauth/ConsentForm.tsx:450-455` gives a generic trust warning but does not label the application as dynamically registered or unverified.

Impact:

A malicious public client can impersonate a trusted Phaseo or partner application and request destructive control-plane access. With `gateway:access` and no protected-resource binding, an approved client can receive a delegated key and call the control-plane API directly; MCP feature flags do not prevent that path. The victim must still approve consent, so this is not an OAuth authentication bypass; it is a high-impact consent-phishing path. The remote logo also acts as a third-party request from a sensitive consent page and can be used as a tracking pixel.

Required fix:

- Do not allow destructive scopes through unauthenticated public DCR.
- Restrict administrative scopes to owner-created or verified OAuth clients.
- Show an unmissable **Unverified application** label, client ID, redirect hostname, and registration source on consent.
- Reserve Phaseo/product names and trusted branding for verified clients.
- Proxy/cache validated logos or use a default icon for unverified clients; do not load arbitrary remote images directly on consent.

Compensating controls: strict DCR rate limiting, exact redirect URI validation, S256 PKCE, and explicit user consent.

False-positive note: the consent UI does enumerate requested permissions clearly. The concern is deceptive client identity combined with the newly available high-impact permissions.

### MCP-SECRET-004 — Secret values enter model-visible tool results

Severity: **High**  
Status: **Remediated in the working tree; secret tools remain disabled**

Evidence:

- Secret-creating tools are separately classified in `apps/mcp/src/mutation-tools.ts:76-313`.
- `apps/mcp/src/mutation-tools.ts:317-322` requires `PHASEO_MCP_SECRET_TOOLS_ENABLED=true`.
- `apps/mcp/src/mutation-tools.ts:365-373` returns the complete upstream API result as `structuredContent` without redaction.

Impact:

Gateway keys, management keys, OAuth client secrets, webhook signing secrets, or rotated secrets can enter the model context, MCP host history, conversation exports, telemetry, screenshots, and user copy/paste flows. “Shown once” at the API does not mean “retained once” after it passes through an AI client.

Required fix:

Return a one-time Phaseo-hosted reveal URL or complete secret handoff out of band. The model-visible response should contain only metadata such as key ID, prefix, expiry, and a confirmation that creation succeeded. If no out-of-band design is available, do not offer secret creation/rotation over MCP.

Compensating control: `PHASEO_MCP_SECRET_TOOLS_ENABLED` is false in production.

False-positive note: some MCP hosts may avoid storing structured results. Phaseo cannot assume that behavior across ChatGPT, CLI, IDE, and third-party MCP clients.

### API-ERROR-005 — Raw backend errors can propagate through MCP

Severity: **Medium**  
Status: **Remediated in the working tree; not yet deployed**

Evidence:

- `apps/api/src/routes/v1/control/settings.ts:105-115` and `:134-154` return caught backend error messages to the caller.
- `apps/api/src/routes/oauth.ts:540-546`, `:562-574`, and `:768-790` return Supabase error text in OAuth responses.
- `apps/mcp/src/phaseo-api.ts:93-98` extracts upstream `message` or `error` values.
- `apps/mcp/src/mutation-tools.ts:333-335` returns that text to the MCP caller.

Impact:

Authenticated clients can receive database constraint, table, schema-cache, or provider details useful for reconnaissance. If a returned message ever includes sensitive values, it would also become model-visible.

Required fix:

Return stable public error codes, generic messages, and a request ID. Log detailed errors server-side after structured redaction. The MCP layer should replace upstream 5xx descriptions with a generic failure and correlation ID.

False-positive note: many current database messages may be harmless. The issue is the absence of a boundary that guarantees they remain harmless as schemas and providers evolve.

### MCP-ABUSE-006 — No dedicated mutation throttling or idempotency

Severity: **Medium**  
Status: **Remediated in the working tree; production remains gated**

Evidence:

- OAuth registration, authorization, and token exchange use rate limiting, including production fail-closed behavior in `apps/api/src/lib/oauth/rateLimit.ts:11-29`.
- The authenticated MCP route in `apps/mcp/src/index.ts:652-669` performs no per-user, per-client, per-workspace, or per-tool rate-limit check.
- `apps/mcp/src/mutation-tools.ts:348-352` marks POST operations non-idempotent, but `:356-369` provides no idempotency key or replay protection.

Impact:

A compromised or runaway client can rapidly create, rotate, update, or delete resources within its grant. Transport retries can duplicate non-idempotent creates, including keys and OAuth applications.

Required fix:

- Add limits keyed by user + OAuth client + workspace + tool, with stricter destructive and secret-operation buckets.
- Accept/generate idempotency keys for mutation requests and store short-lived results for safe replay.
- Apply conservative bulk-operation limits and concurrency caps.

False-positive note: Cloudflare or upstream infrastructure may impose generic traffic limits not visible in this repository. Generic edge limits do not replace identity- and operation-aware mutation quotas.

### OPS-AUDIT-007 — No durable control-plane mutation audit trail found

Severity: **Medium**  
Status: **Remediated in the working tree; migration not yet applied**

Evidence:

- `apps/mcp/src/mutation-tools.ts:356-375` proxies mutations and returns results without recording a security event.
- The reviewed control-plane handlers enforce capability and workspace role, but no shared immutable audit-event write was found for MCP/OAuth CRUD operations.

Impact:

Phaseo would have limited ability to determine which OAuth client or MCP tool changed a resource, investigate accidental deletion, alert on abnormal administration, or provide customers with an administrative audit history.

Required fix:

Record an immutable event for every attempted mutation: actor user, OAuth client, workspace, MCP tool/API action, target IDs, normalized field names or before/after hashes, result, request ID, source, and timestamp. Never log bearer tokens, generated secrets, webhook secrets, or full sensitive payloads.

False-positive note: an external SIEM or Cloudflare log pipeline may already capture part of this. No durable application-level audit control was visible in the reviewed repository, and raw request logs would not be an adequate substitute.

### MCP-SCHEMA-008 — Generic update objects weaken intent validation

Severity: **Medium**  
Status: **Remediated in the working tree; not yet deployed**

Evidence:

- `apps/mcp/src/mutation-tools.ts:39-43` defines a generic `Record<string, unknown>` change object.
- It is used by multiple update tools, while some configuration records are also open-ended.
- Downstream APIs such as `apps/api/src/routes/v1/control/settings.ts:127-131` normalize supported fields and reject empty normalized updates.

Impact:

The MCP schema cannot clearly tell the model which fields are legal or high impact. This increases confused-deputy risk, makes exact confirmation harder, and can allow newly accepted downstream fields to become mutable through MCP without a corresponding MCP security review.

Required fix:

Define exact per-resource schemas, reject unknown keys, add field-level bounds/enums, and generate or share these contracts with the API. Bind confirmation to the normalized accepted payload, not the model's original object.

False-positive note: current downstream normalization prevents straightforward mass assignment in the reviewed settings route. This is defense-in-depth and change-control risk, not a demonstrated direct injection.

### MCP-DOS-009 — Body cap can be bypassed without `Content-Length`

Severity: **Low**  
Status: **Remediated in the working tree; not yet deployed**

Evidence:

- `apps/mcp/src/index.ts:659-661` checks only the `Content-Length` header before handing the request to the MCP handler.
- The OAuth endpoint already demonstrates a streaming, actual-byte limit in `apps/api/src/routes/oauth.ts:109-142`.

Impact:

A chunked or otherwise unknown-length request bypasses the MCP application's intended 1 MiB cap, increasing parsing CPU/memory and request-cost exposure. Cloudflare platform request limits still bound the maximum impact.

Required fix:

Apply an actual-byte streaming limit before MCP JSON parsing, or reject missing/invalid `Content-Length` where protocol compatibility permits. Reuse the tested OAuth body-reader pattern.

## Security controls that are working well

- Production write, destructive, and secret flags are all false: `apps/mcp/wrangler.jsonc:35-39`.
- Mutation tools require every declared scope before registration: `apps/mcp/src/mutation-tools.ts:325-340`.
- Control-plane APIs independently enforce capabilities and workspace roles. Representative examples include Gateway keys at `apps/api/src/routes/v1/control/keys.ts:457-467`, `:608-641`, and `:722-730`; workspaces at `apps/api/src/routes/v1/control/workspaces.ts:246-248`, `:347-349`, and `:429-431`; and guardrails at `apps/api/src/routes/v1/control/guardrails.ts:289-291`, `:344-346`, and `:377-379`.
- OAuth requires exact registered redirects, S256 PKCE, bounded inputs, resource binding, active workspace access, and single-use/atomic code consumption: `apps/api/src/routes/oauth.ts:432-574` and `:755-839`.
- MCP token exchange uses a minimum-64-character confidential secret with constant-time comparison and exact OAuth-resource matching: `apps/api/src/routes/oauth.ts:864-925`.
- MCP-to-API upstream tokens are short-lived and bound to user, workspace, client, and scopes: `apps/api/src/lib/oauth/service.ts:327-345`.
- OAuth rate limits fail closed in production: `apps/api/src/lib/oauth/rateLimit.ts:17-29`.
- MCP rejects bearer tokens in URLs: `apps/mcp/src/index.ts:657-658`.
- Webhook delivery requires HTTPS, rejects private/local literals and private DNS answers, revalidates immediately before delivery, uses a timeout, and refuses redirects: `apps/api/src/core/webhook-endpoints.ts:148-219` and `apps/api/src/core/async-notifications.ts:1027-1055`.
- Webhook signing secrets use authenticated encryption and support key rotation; tracked files contain placeholders/test values rather than the production MCP resource-server secret.
- OAuth consent clearly lists individual requested permissions, including write/delete labels.

## Verification performed

Commands run from the MCP worktree:

```text
pnpm --filter @phaseo/mcp test
  3 files passed, 18 tests passed

pnpm --filter @phaseo/gateway-api exec vitest run \
  src/lib/mcp/actionApprovals.test.ts \
  src/routes/oauth.security.test.ts \
  src/lib/oauth/service.security.test.ts \
  src/lib/oauth/service.test.ts \
  src/lib/oauth/rateLimit.test.ts \
  src/routes/v1/control/guardrails.security.test.ts \
  src/routes/v1/control/management-keys.security.test.ts \
  src/routes/v1/control/oauth-clients.security.test.ts \
  src/routes/v1/control/webhook-endpoints.security.test.ts
  9 files passed, 64 tests passed

pnpm --filter @phaseo/gateway-api typecheck
  passed

pnpm --filter @phaseo/web typecheck
  passed

pnpm --filter @phaseo/web test
  88 files passed, 378 tests passed

pnpm --filter @phaseo/web build
  passed

pnpm audit --prod --audit-level high
  No known vulnerabilities found
```

Passing tests establish local regression coverage. The migrations, production
secret configuration, and staging browser flow still require deployment-time
verification.

## Rollout decision and remediation order

1. **Today:** keep the deployed MCP read-only. Before treating third-party OAuth as launch-ready, remove write/delete scopes from public DCR or disable DCR until the unverified-client consent controls are in place.
2. **Before ordinary writes:** resolve MCP-CRUD-001, MCP-CRUD-002, OAUTH-CRUD-003, API-ERROR-005, and add the basic controls in MCP-ABUSE-006 and OPS-AUDIT-007.
3. **Before destructive tools:** require server-verifiable, target-bound confirmation; introduce stricter destructive scopes/clients, rate limits, alerts, and recovery/runbook coverage.
4. **Before secret tools:** implement out-of-band secret reveal and verify all Cloudflare/MCP/client observability paths exclude tool inputs and results.
5. Run a staging adversarial test covering prompt injection, deceptive DCR clients, replay/retry, cross-workspace IDs, revoked grants, stale OAuth codes, malformed/chunked bodies, and webhook DNS rebinding before changing production flags.
