# Phaseo

## What this codebase does

Phaseo is a unified AI gateway and model intelligence platform. The main security surface is `apps/api`, a Hono + Cloudflare Workers gateway that authenticates API keys or OAuth tokens, routes requests across AI providers, applies workspace policy and guardrails, and records usage. `apps/web` is a Next.js dashboard backed by Supabase for workspace settings, management API keys, OAuth apps, guardrails, billing, and authorized-app management. The repo also ships SDKs and generated clients, but the highest-risk paths are gateway auth, key issuance, workspace-scoped control-plane routes, and provider credential forwarding.

## Auth shape

- `authenticate()` in `apps/api/src/pipeline/before/auth.ts` is the main gateway auth entry point for bearer API keys and gateway OAuth JWTs.
- `authenticateManagement()` and `guardManagementAuth()` protect elevated control-plane routes that act through `management_keys`.
- Web server actions usually gate with `requireAuthenticatedUser()`, `requireActingUser()`, and `requireWorkspaceMembership()` before reading or mutating workspace-scoped records.
- `updateSession()` in `apps/web/src/utils/supabase/middleware.ts` and `getViewerRole()` / `isAdminViewer()` enforce logged-in dashboard access and role-aware UI/admin flows.
- OAuth app and token exchange flows resolve app metadata plus redirect URI through `resolveOAuthApp()` and compare `client_id` / token claims before minting gateway keys.

## Threat model

The highest-impact failure is unauthorized creation, disclosure, or reuse of gateway API keys, management API keys, OAuth client secrets, or provider credentials. Next is cross-workspace access: reading or mutating another workspace's keys, members, wallet, policies, OAuth apps, usage, or guardrail settings by trusting request-supplied IDs too early. The gateway also has policy-bypass risk: a request that should be blocked by model restrictions, provider allow/block lists, prompt-injection checks, or sensitive-info rules must not reach an upstream provider through an alternate endpoint or alias path.

## Project-specific patterns to flag

- Any path that inserts, updates, deletes, or returns plaintext for `keys`, `management_keys`, `oauth_app_metadata`, `oauth_authorizations`, `workspace_*`, or `wallets` should prove both actor identity and workspace ownership, not just possession of an ID.
- Any code that trusts `workspaceId`, `user.id`, `client_id`, `created_by`, or redirect URIs from request input or decoded JWT claims should verify them against Supabase membership/authorization state before side effects.
- Any path that forwards upstream `Authorization` headers, BYOK credentials, or provider secrets should be checked for cross-tenant leakage, logging, caching, or accidental echoing in debug/preview responses.
- Any endpoint variant that bypasses shared before-stage guards is risky; alternate request shapes, legacy endpoints, or direct route handlers must still run auth, credit, workspace policy, and guardrail enforcement consistently.
- Provider/model filtering is workspace-specific and alias-heavy; flag code that can bypass `applyWorkspacePolicy()` or guardrail restrictions by using provider-scoped model names, `provider` hints, or fallback/remap behavior.

## Known false-positives

- Test suites and fixtures under `apps/api/tests/**`, `apps/web/tests/**`, and `packages/sdk/**/tests/**` intentionally contain fake bearer tokens, session IDs, OAuth flows, and auth edge cases.
- README/examples/scripts use sample `Authorization: Bearer ...` values and quickstart credentials for documentation, smoke tests, or local demos.
- Some server actions intentionally return plaintext secrets exactly once at creation time, notably management key creation and OAuth-to-gateway key exchange; secret exposure is only a bug if it happens outside those issuance flows.
- Supabase admin-client usage in server-only helpers and OAuth app management paths is intentional, but those call sites still need membership/ownership checks before mutation.
