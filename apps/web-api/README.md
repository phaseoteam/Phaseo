# Web API Worker

This Worker owns the Cloudflare implementation of the web application's API paths. It is deliberately separate from the external gateway at `api.phaseo.app`.

## Initial production route

The first production rollout is deliberately limited to
`phaseo.app/api/_web/*`. This serves anonymous, cacheable web data such as the
models catalogue and search index. All account, chat, checkout, Stripe webhook,
and internal API paths continue to run on Vercel. Expand the Cloudflare route
only after each endpoint family has completed its own rollout.

## API boundary

| Path | Intended data | Authentication | Cache policy |
| --- | --- | --- | --- |
| `/api/_web/*` | Anonymous website data | None | Explicit Cloudflare edge caching only where safe |
| Other `/api/*` paths | Authenticated, billing, and internal data | Vercel-owned | Their existing policy |

`_web` means the response is identical for every caller. A public endpoint may
still be uncacheable when its data is live. User, workspace, billing, and
internal data are explicitly outside this Worker’s production route.

## Model API cache contract

| Endpoint | Purpose | Cloudflare cache |
| --- | --- | --- |
| `GET /api/_web/models` | Main catalogue, pagination, and name search | 5 minutes + 5-minute stale window |
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

Each model page section will be added as an independent resource rather than extending the overview response. The table migration follows the same principle: a stable catalogue/facet resource is kept separate from frequently changing gateway telemetry.

## Local development

1. Create `apps/web-api/.dev.vars` with the non-production values needed by a route. The account API requires `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
2. Start the Worker with `pnpm --filter @phaseo/web-api dev`.
3. Start the web app with `WEB_API_ORIGIN=http://127.0.0.1:8788 pnpm --filter @phaseo/web dev`.

`WEB_API_ORIGIN` is for local development and Vercel previews only. Do not set it for production: Cloudflare intercepts `phaseo.app/api/*` before the request reaches Vercel.

## Deployment prerequisites

- Add the production `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as Worker environment values/secrets. The service-role key is only available inside Cloudflare and is used to read public catalogue data consistently regardless of Supabase RLS.
- Deploy this Worker after confirming that `phaseo.app` is an active proxied Cloudflare zone. Its initial route only matches `phaseo.app/api/_web/*`; the rest of the hostname and web API continue to Vercel.
- Keep `api.phaseo.app` deployed from `apps/api`; it remains the external gateway API.

## Staging and promotion

- `pnpm exec wrangler deploy --env staging` creates `phaseo-web-api-staging` on the account's `workers.dev` subdomain. It has no `phaseo.app` route, so it is safe for PR validation.
- The PR workflow deploys that staging Worker and points its Vercel preview at it with `WEB_API_ORIGIN`; it supplies the origin at both build and runtime without changing Vercel's shared preview environment.
- Before the first staging deployment, provision its `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` values in Cloudflare.
- Merges to `main` deploy the production Worker from `apps/web-api`. The Worker is the only service allowed to own `phaseo.app/api/_web/*` during the initial rollout.
- After deployment, run `INCLUDE_LEGACY_API_SMOKES=1 pnpm --filter @phaseo/web-api smoke:production` (macOS/Linux), or `$env:INCLUDE_LEGACY_API_SMOKES='1'; pnpm --filter @phaseo/web-api smoke:production` (PowerShell). It verifies the Cloudflare models cache contract, then safely verifies that unauthenticated checkout and an unsigned Stripe webhook are rejected by Vercel. It cannot create a payment or credit a workspace.
- In an isolated Stripe test environment, add `SIGNED_STRIPE_WEBHOOK_SMOKE=1` and that environment's `STRIPE_WEBHOOK_SECRET` to verify signature validation with a signed `customer.created` event. The handler ignores that event type, so it does not create a payment, credit a workspace, or call Stripe's API.
