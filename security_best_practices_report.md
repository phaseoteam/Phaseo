# Security Best Practices Report

## Executive Summary

The highest-risk issues are authorization failures, not cryptographic or parsing bugs. The API control plane currently collapses data-plane and admin-plane trust: a normal gateway API key can reach management and OAuth-administration endpoints without any scope or role enforcement. On the web side, several sensitive workspace operations are protected only by basic workspace membership instead of owner/admin privileges, including OAuth app management and Stripe-backed billing/payment flows. I did not find a pre-auth remote code execution path in the reviewed surface, and some critical ingress paths are implemented correctly, notably Stripe webhook signature verification and the internal video/model-discovery webhook/token checks.

## Critical Findings

### SA-001: API control-plane endpoints are reachable with ordinary gateway API keys
- Severity: Critical
- Impact: Compromise or over-distribution of any normal workspace gateway key can escalate directly into workspace-wide administrative actions, including management-key CRUD and OAuth client administration.
- Evidence:
  - [apps/api/src/pipeline/before/auth.ts](apps/api/src/pipeline/before/auth.ts) lines 293-345 and 432-450 authenticate Bearer tokens by loading rows from the `keys` table and return only `workspaceId`/key references; there is no scope or role evaluation in the auth result.
  - [apps/api/src/routes/v1/control/management.ts](apps/api/src/routes/v1/control/management.ts) lines 209-236, 275-340, and 438-470 gate management-key listing/creation/read with `guardAuth(...)` and then immediately operate on `management_keys`.
  - [apps/api/src/routes/v1/control/oauth-clients.ts](apps/api/src/routes/v1/control/oauth-clients.ts) lines 1-8 state “appropriate permissions,” but lines 51-66 only apply `guardAuth(...)`; update/delete flows then act on workspace-owned OAuth clients at lines 418-444 and 456-470 without any additional role or scope checks.
- Why this is dangerous:
  - The system has a separate `management_keys` concept, but control routes are authenticated by ordinary gateway keys from `keys`, not by management keys or scoped claims.
  - A key intended for inference traffic is typically more widely distributed than an admin credential. Treating it as an admin credential makes any downstream leakage materially worse.
- Recommended fix:
  - Split control-plane auth from data-plane auth.
  - Require either management-key authentication or explicit scope/role claims for `/v1/management/*`, `/v1/keys/*`, `/v1/oauth-clients/*`, and similar admin routes.
  - Extend `authenticate()` / `guardAuth()` to return validated scopes and enforce them per route.

## High Findings

### SA-002: Web OAuth app administration is member-level, not admin-level
- Severity: High
- Impact: Any workspace member can create OAuth apps, rotate client secrets, update redirect URIs, or delete apps, allowing a low-privilege user to backdoor or disrupt third-party integrations.
- Evidence:
  - [apps/web/src/app/(dashboard)/settings/oauth-apps/actions.ts](apps/web/src/app/(dashboard)/settings/oauth-apps/actions.ts) lines 165-170 only verify that the caller is present in `workspace_members` before app creation.
  - The same file uses the same member-only check for updates at lines 290-299, secret regeneration at lines 356-370, deletion at lines 430-448, and listing at lines 481-487.
  - By contrast, [apps/web/src/app/(dashboard)/settings/management-api-keys/actions.ts](apps/web/src/app/(dashboard)/settings/management-api-keys/actions.ts) lines 51-54 correctly require `["owner", "admin"]`.
- Recommended fix:
  - Replace direct membership checks in OAuth app server actions with `requireWorkspaceMembership(..., ["owner", "admin"])`.
  - Apply the same admin-only rule to secret regeneration and redirect-URI changes.

### SA-003: Stripe billing and payment routes are member-level, not admin-level
- Severity: High
- Impact: Any workspace member can interact with the shared billing customer, including viewing payment-method metadata, changing the default card, detaching payment methods, starting billing-portal sessions, initiating top-ups, and requesting refunds.
- Evidence:
  - [apps/web/src/lib/server/activeTeamStripe.ts](apps/web/src/lib/server/activeTeamStripe.ts) lines 77-109 resolve the active Stripe customer after only `requireWorkspaceMembership(...)` with no owner/admin restriction.
  - [apps/web/src/app/api/stripe/payment-methods/route.ts](apps/web/src/app/api/stripe/payment-methods/route.ts) lines 90-95 expose payment-method listing, lines 108-129 create setup sessions, lines 142-170 update default payment methods, and lines 183-210 detach methods, all via `requireActiveWorkspaceStripeCustomer(...)`.
  - [apps/web/src/app/api/stripe/billing-portal/route.ts](apps/web/src/app/api/stripe/billing-portal/route.ts) lines 25-34 create billing-portal sessions with the same helper.
  - [apps/web/src/app/api/stripe/refunds/request/route.ts](apps/web/src/app/api/stripe/refunds/request/route.ts) lines 59-70 allow refund initiation with the same helper.
  - This conflicts with the admin-only web settings flows in [apps/web/src/app/(dashboard)/settings/credits/actions.ts](apps/web/src/app/(dashboard)/settings/credits/actions.ts) lines 37-40 and 145-152, which do require owner/admin for billing mutations.
- Recommended fix:
  - Introduce a dedicated billing authorization helper that requires owner/admin for all payment-method, refund, billing-portal, and checkout mutation routes.
  - Limit member access, if needed, to read-only views that do not expose shared billing controls.

## Medium Findings

### SA-004: No application-level CSP or baseline security headers are visible in the Next.js app
- Severity: Medium
- Impact: If the edge/CDN layer is not adding these headers, the web app lacks baseline browser hardening against XSS amplification, clickjacking, and MIME confusion.
- Evidence:
  - [apps/web/next.config.mjs](apps/web/next.config.mjs) lines 13-38 define env, tracing, and rewrites, but there is no `headers()` configuration for CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, or `X-Content-Type-Options`.
  - [apps/web/src/proxy.ts](apps/web/src/proxy.ts) lines 8-13 only scope session middleware to selected routes; no browser security headers are set there either.
- False-positive note:
  - This may be mitigated outside the repo by Vercel/CDN/WAF config. I did not see app-code evidence of that, so verify runtime response headers in production.
- Recommended fix:
  - Add a baseline header policy in Next config or at the edge:
    - `Content-Security-Policy`
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy`
    - clickjacking protection via `frame-ancestors` or `X-Frame-Options`
    - a constrained `Permissions-Policy`

## Validated Controls

- Stripe webhook signature verification is implemented before event handling in [apps/web/src/app/api/webhooks/stripe-checkout/route.ts](apps/web/src/app/api/webhooks/stripe-checkout/route.ts) lines 291-300.
- Internal model-discovery execution requires a dedicated high-entropy token and rejects short tokens in [apps/api/src/routes/internal/model-discovery.ts](apps/api/src/routes/internal/model-discovery.ts) lines 84-117.
- Async video webhook handlers verify provider signatures before processing in [apps/api/src/routes/internal/video-webhooks.ts](apps/api/src/routes/internal/video-webhooks.ts) lines 21-31 and 74-83.
- Return URL sanitization for auth redirects is present in [apps/web/src/lib/auth/return-url.ts](apps/web/src/lib/auth/return-url.ts).

## Recommended Remediation Order

1. Lock down API control-plane auth so ordinary gateway keys cannot call admin routes.
2. Change web OAuth app actions to owner/admin only.
3. Change billing/payment/refund routes to owner/admin only.
4. Add and verify baseline security headers/CSP at the app or edge layer.

