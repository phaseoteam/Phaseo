# Web API Worker

This Worker owns the Cloudflare implementation of the web application's API paths. It is deliberately separate from the external gateway at `api.phaseo.app`.

## Initial production route

The first production rollout is deliberately limited to
`phaseo.app/api/public/models*`. This covers the models catalogue and each
model's section resources, while all other web API paths continue to run on
Vercel. Expand the Cloudflare route only after each additional endpoint family
has completed its own rollout.

## API boundary

| Path | Intended data | Authentication | Cache policy |
| --- | --- | --- | --- |
| `/api/public/*` | Anonymous website data | None | Explicit Cloudflare edge caching only where safe |
| `/api/account/*` | Current user/workspace data | Supabase bearer JWT | `private, no-store` |

`public` means the response is identical for every caller. A public endpoint may still be uncacheable when its data is live. `account` means user or workspace data and must never be sent through a shared cache.

Authenticated credit endpoints require a Supabase bearer JWT and a `workspaceId` query parameter. The Worker verifies that the JWT user is a member of that workspace before reading financial data.

## Model API cache contract

| Endpoint | Purpose | Cloudflare cache |
| --- | --- | --- |
| `GET /api/public/models` | Main catalogue, pagination, and name search | 1 hour + 24-hour stale window |
| `GET /api/public/models/:modelId` | Stable model overview/about facts | 1 day + 7-day stale window |
| `GET /api/public/models/:modelId/benchmarks` | Benchmark results | 1 day + 7-day stale window |
| `GET /api/public/models/:modelId/performance` | Gateway performance rollup | 15 minutes + 15-minute stale window |
| `GET /api/public/models/:modelId/timeline` | Stable lifecycle/version timeline | 1 day + 7-day stale window |
| `GET /api/public/models/:modelId/subscription-plans` | Model subscription-plan coverage | 1 day + 7-day stale window |
| `GET /api/public/models/:modelId/pricing` | Active provider pricing rules | 1 hour + 24-hour stale window |

## Other public reference APIs

| Endpoint | Purpose | Cloudflare cache |
| --- | --- | --- |
| `GET /api/public/organisations` | Organisation identities | 1 day + 7-day stale window |
| `GET /api/public/benchmarks?sort=coverage` | Benchmark reference list | 1 day + 7-day stale window |
| `GET /api/public/api-providers` | Stable provider identity metadata | 1 day + 7-day stale window |
| `GET /api/public/families` and `/:familyId` | Model family reference data | 1 day + 7-day stale window |
| `GET /api/public/subscription-plans` and `/:planId` | Public subscription-plan data | 1 day + 7-day stale window |
| `GET /api/public/countries` and `/:iso` | Country and public model summaries | 1 day + 7-day stale window |
| `GET /api/public/collections` | Derived public model collections | 1 hour + 24-hour stale window |

Each model page section will be added as an independent resource rather than extending the overview response. The table migration follows the same principle: a stable catalogue/facet resource is kept separate from frequently changing gateway telemetry.

## Local development

1. Create `apps/web-api/.dev.vars` with the non-production values needed by a route. The account API requires `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
2. Start the Worker with `pnpm --filter @phaseo/web-api dev`.
3. Start the web app with `WEB_API_ORIGIN=http://127.0.0.1:8788 pnpm --filter @phaseo/web dev`.

`WEB_API_ORIGIN` is for local development and Vercel previews only. Do not set it for production: Cloudflare intercepts `phaseo.app/api/*` before the request reaches Vercel.

## Deployment prerequisites

- Add the production `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as Worker environment values/secrets. The service-role key is only available inside Cloudflare and is used to read public catalogue data consistently regardless of Supabase RLS.
- Deploy this Worker after confirming that `phaseo.app` is an active proxied Cloudflare zone. Its initial route only matches `phaseo.app/api/public/models*`; the rest of the hostname and web API continue to Vercel.
- Keep `api.phaseo.app` deployed from `apps/api`; it remains the external gateway API.

## Staging and promotion

- `pnpm exec wrangler deploy --env staging` creates `phaseo-web-api-staging` on the account's `workers.dev` subdomain. It has no `phaseo.app` route, so it is safe for PR validation.
- The PR workflow deploys that staging Worker and points its Vercel preview at it with `WEB_API_ORIGIN`; it supplies the origin at both build and runtime without changing Vercel's shared preview environment.
- Before the first staging deployment, provision its `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` values in Cloudflare.
- After merge, CI deploys the default environment as `phaseo-web-api`, which is the only environment allowed to own `phaseo.app/api/public/models*` during the initial rollout.
