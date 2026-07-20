# Web API Worker

This Worker owns the Cloudflare implementation of the web application's API paths. It is deliberately separate from the external gateway at `api.phaseo.app`.

## Production route

Cloudflare owns `phaseo.app/api/_web/*`, `phaseo.app/api/account/*`,
`phaseo.app/api/chat/*`, `phaseo.app/api/internal/*`, and the Stripe webhook at
`phaseo.app/api/webhooks/stripe-checkout`. Next/Vercel no longer contains
application API handlers. The
external gateway at `api.phaseo.app` remains a separate Worker in `apps/api`.

## API boundary

| Path | Intended data | Authentication | Cache policy |
| --- | --- | --- | --- |
| `/api/_web/*` | Anonymous website data | None | Explicit Cloudflare edge caching only where safe |
| `/api/account/*` | Current user/workspace data | Supabase bearer JWT | `private, no-store` |
| `/api/chat/*` | Authenticated chat/playground gateway proxy | Supabase bearer JWT and managed workspace key | `private, no-store` |
| `/api/internal/*` | Privileged operations | Route-specific secret or user/role check | `private, no-store` |
| `/api/webhooks/stripe-checkout` | Stripe billing events | Stripe signature | `private, no-store` |

`public` means the response is identical for every caller. A public endpoint may still be uncacheable when its data is live. `account` means user or workspace data and must never be sent through a shared cache.

Authenticated credit endpoints require a Supabase bearer JWT and a `workspaceId` query parameter. The Worker verifies that the JWT user is a member of that workspace before reading financial data.

## Model API cache contract

| Endpoint | Purpose | Cloudflare cache |
| --- | --- | --- |
| `GET /api/_web/models` | Main catalogue, pagination, and name search | 1 hour + 24-hour stale window |
| `GET /api/_web/models/:modelId` | Stable model overview/about facts | 1 day + 7-day stale window |
| `GET /api/_web/models/:modelId/benchmarks` | Benchmark results | 1 day + 7-day stale window |
| `GET /api/_web/models/:modelId/performance` | Gateway performance rollup | 15 minutes + 15-minute stale window |
| `GET /api/_web/models/:modelId/timeline` | Stable lifecycle/version timeline | 1 day + 7-day stale window |
| `GET /api/_web/models/:modelId/subscription-plans` | Model subscription-plan coverage | 1 day + 7-day stale window |
| `GET /api/_web/models/:modelId/pricing` | Active provider pricing rules | 1 hour + 24-hour stale window |

## Other public reference APIs

| Endpoint | Purpose | Cloudflare cache |
| --- | --- | --- |
| `GET /api/_web/organisations` | Organisation identities | 1 day + 7-day stale window |
| `GET /api/_web/benchmarks?sort=coverage` | Benchmark reference list | 1 day + 7-day stale window |
| `GET /api/_web/api-providers` | Stable provider identity metadata | 1 day + 7-day stale window |
| `GET /api/_web/families` and `/:familyId` | Model family reference data | 1 day + 7-day stale window |
| `GET /api/_web/subscription-plans` and `/:planId` | Public subscription-plan data | 1 day + 7-day stale window |
| `GET /api/_web/countries` and `/:iso` | Country and public model summaries | 1 day + 7-day stale window |
| `GET /api/_web/collections` | Derived public model collections | 1 hour + 24-hour stale window |
| `GET /api/_web/search` | Compact header search index | 15 minutes + 1-hour stale window |

Each model page section will be added as an independent resource rather than extending the overview response. The table migration follows the same principle: a stable catalogue/facet resource is kept separate from frequently changing gateway telemetry.

## Local development

1. Create `apps/web-api/.dev.vars` with the non-production values needed by a route. The account API requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; the local Worker also accepts the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` names used by `apps/api/.dev.vars`.
	Stripe-backed billing routes additionally require `TEST_STRIPE_SECRET_KEY` locally (or `STRIPE_SECRET_KEY` outside test environments). Stripe webhook testing also requires `STRIPE_WEBHOOK_SECRET`; `RESEND_API_KEY` and `DISCORD_BILLING_WEBHOOK_URL` enable checkout and credit-purchase notifications.
	Authenticated automatic chat issue creation additionally uses `GITHUB_TOKEN` (or `GH_TOKEN`) and optional `GITHUB_REPOSITORY`; anonymous reports fall back to a prefilled GitHub issue URL.
	Scheduled YouTube ingestion requires `YT_API_KEY`. Watchers can be run locally with `POST /api/internal/watchers/web` or `/youtube` using `Authorization: Bearer $REVALIDATION_SECRET`.
	Key-management routes require `KEY_PEPPER_ACTIVE`; OAuth client management
	uses `PHASEO_OAUTH_TOKEN_PEPPER` (falling back to the active key pepper) and
	`PHASEO_THIRD_PARTY_OAUTH_ENABLED`. BYOK writes require
	`BYOK_KMS_KEY_V1`, with optional `BYOK_ACTIVE_KEY_VERSION` and a dedicated
	`BYOK_FINGERPRINT_PEPPER`. Async webhook signing secrets require
	`ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY` (or
	`WEBHOOK_SECRET_ENCRYPTION_KEY`). Managed chat keys require
	`CHAT_ROUTE_KEY_SEED` and reuse `KEY_PEPPER_ACTIVE` for gateway-compatible
	hashes. Chat proxy routes also require `AI_STATS_GATEWAY_URL` (or
	`PHASEO_GATEWAY_URL`). Gateway comparison routes require
	`PHASEO_PERFORMANCE_TEST_KEY`, `PERFORMANCE_KEY_OPENROUTER`, and optionally
	`PERFORMANCE_KEY_LLMGATEWAY` and `PERFORMANCE_KEY_VERCEL_AI_GATEWAY`.
	Compatibility validation can override its upstream schemas with
	`COMPATIBILITY_OPENAI_SPEC_URL` and `COMPATIBILITY_ANTHROPIC_SPEC_URL`.
	`DISCORD_SIGNUP_WEBHOOK_URL` preserves account-deletion lifecycle notices.
2. Start the Worker with `pnpm --filter @phaseo/web-api dev`.
3. Start the web app with `WEB_API_ORIGIN=http://127.0.0.1:8788 pnpm --filter @phaseo/web dev`.

`WEB_API_ORIGIN` is for local development and Vercel previews. Production
defaults to `https://phaseo.app`, where Cloudflare intercepts the four route
namespaces in the API boundary table. Server-side web clients use
`cache: "no-store"`; Cloudflare is
the sole cache owner for migrated data.

## Deployment prerequisites

- Add the production `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as Worker environment values/secrets. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as Worker secrets before enabling billing routes, and configure Stripe to deliver checkout events to `/api/webhooks/stripe-checkout`. Add `RESEND_API_KEY` and `DISCORD_BILLING_WEBHOOK_URL` to retain billing notifications. The service-role key is only available inside Cloudflare and is used to read public catalogue data consistently regardless of Supabase RLS.
- Add `YT_API_KEY` as a Worker secret for the 30-minute scheduled YouTube watcher. The web watcher needs no provider credential. Successful watcher writes purge `web-api-updates`, the watcher-specific tag, and `web-api-updates-latest`.
- Provision `KEY_PEPPER_ACTIVE`, `PHASEO_OAUTH_TOKEN_PEPPER`,
  `BYOK_KMS_KEY_V1`, `BYOK_FINGERPRINT_PEPPER`, and
  `ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY` as Worker secrets before
  enabling the corresponding mutation routes. Configure
  `PHASEO_THIRD_PARTY_OAUTH_ENABLED`, `NON_ENTERPRISE_KEY_LIMIT`,
  `GATEWAY_API_ORIGIN`, and the gateway invalidation credentials consistently
  in staging and production.
- Deploy this Worker after confirming that `phaseo.app` is an active proxied Cloudflare zone. Its routes match `phaseo.app/api/_web/*`, `/api/account/*`, `/api/chat/*`, `/api/internal/*`, and the explicit Stripe webhook; the rest of the hostname continues to Vercel.
- Keep `api.phaseo.app` deployed from `apps/api`; it remains the external gateway API.

## Staging and promotion

- `pnpm exec wrangler deploy --env staging` creates `phaseo-web-api-staging` on the account's `workers.dev` subdomain. It has no `phaseo.app` route, so it is safe for PR validation.
- The PR workflow deploys that staging Worker and points its Vercel preview at it with `WEB_API_ORIGIN`; it supplies the origin at both build and runtime without changing Vercel's shared preview environment.
- Before the first staging deployment, provision its `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, test-mode `STRIPE_SECRET_KEY`, and staging webhook signing secret in Cloudflare.
- Promote the default environment explicitly with `pnpm exec wrangler deploy --env=""` after the PR is reviewed. `phaseo-web-api` is the only Worker allowed to own the application API namespaces listed above.

The exhaustive route/consumer checklist is maintained in
`docs/architecture/cloudflare-data-fetcher-migration.md`.
