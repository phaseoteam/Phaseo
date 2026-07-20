# Cloudflare web-data migration ledger

This is the completion ledger for moving application data access out of
Next.js/Vercel and into `apps/web-api`. Renaming a Next fetcher does not count:
the Worker must own the query, the consumer must call it, cache/auth semantics
must be explicit, and the old query must no longer be reachable.

## Current checkpoint (2026-07-17)

- 112 non-test files remain under `apps/web/src/lib/fetchers`.
- The fetcher directory contains **zero direct database queries** and **zero
  Next data-cache directives**.
- Its six remaining Supabase imports are authentication transport only
  (`getSession`, browser sign-out, and access-token forwarding).
- **Zero** Next `app/api` handlers remain.
- The repository-wide `apps/web/src` audit contains **zero direct application
  table or RPC access**. Authenticated gateway usage actions now execute in a
  request-scoped Worker context and return through private, no-store routes.
- Public model, provider, organisation, benchmark, family, country,
  subscription-plan, update, app, ranking, monitor, pricing, landing, gateway,
  marketplace, compare, search, OG, and provider-status reads are Worker-owned.
- Admin model source, model/provider audits, catalogue counts/lists/records,
  model-form options, and every browser model-editor section are authenticated
  Worker reads. Basic model, benchmark, and subscription-plan writes now use
  admin-only Worker mutations with cache-tag invalidation.
- Settings layout, onboarding, contact personalization, viewer role/Statsig,
  internal credit-grant reads, and gateway usage metadata are Worker reads.
- Beta/routing preferences, OAuth authorization revocation, onboarding
  progress, app update/merge, credit-grant administration, auto top-up,
  low-balance alerts, credit redemption, workspaces/teams/invitations, presets,
  API and management keys, OAuth apps, BYOK credentials, guardrails, account
  profile settings, and MFA recovery-code storage now mutate through Worker
  routes.

## Route ownership and cache contract

| Namespace | Owner | Data | Cache contract |
| --- | --- | --- | --- |
| `/api/_web/*` | `apps/web-api` | Anonymous, response-identical website data | Cloudflare shared cache with endpoint TTL, stale window, and `Cache-Tag`; Next fetch uses `cache: "no-store"` |
| `/api/account/*` | `apps/web-api` | Current user/workspace/admin data | Bearer authenticated; `private, no-store`; `Vary: Authorization, Cookie`; never shared cached |
| `/api/chat/*` | `apps/web-api` | Authenticated chat/playground gateway proxy | Bearer authenticated; managed key scoped to the selected workspace; streamed and non-streamed responses are `private, no-store` |
| `/api/internal/*` | `apps/web-api` | Privileged operations and cache invalidation | Explicit secret or user/role authorization; `private, no-store` |
| `/api/webhooks/stripe-checkout` | `apps/web-api` | Stripe-signed billing events | Raw-body signature verification; idempotent ledger mutations; `private, no-store` |

Supabase session exchange and post-login workspace bootstrap remain in the
Next.js web server. They are deliberately not Worker calls: a successful sign-in
must not depend on the public-data Worker or its deployment state.
| `/v1/*` on `api.phaseo.app` | `apps/api` | External gateway API | Separate product contract |

Public routes use `Cloudflare-CDN-Cache-Control` plus cache tags. Cloudflare is
the sole public data cache; migrated Next consumers deliberately disable the
Next data cache. Private routes never emit a public cache directive or cache
tag.

## Migrated public domains

| Domain | Worker coverage | Cache class |
| --- | --- | --- |
| Models | catalogue; overview/header/canonical; notices; benchmarks; subscriptions; timeline; apps; pricing/history; performance/activity; realtime; token trajectory; daily usage; provider runtime/health/routing; gateway metadata; free router | 5m telemetry, 15m usage/performance, 1h pricing, 1d stable facts |
| Providers | list/header/models; top apps/models; token series; metrics; routing health; updates | 5–15m live, 1d stable metadata |
| Reference data | organisations, benchmarks, families, countries, subscription plans, sources | 1d fresh / 7d stale |
| Discovery/content | search, updates, apps, marketplace, compare, OG | 1m recent requests, 15m live/content, 1h composed/OG |
| Analytics | rankings, monitor, landing statistics/showcase, pricing tool | 5–15m live, 1h stable aggregates |
| Gateway catalogue | supported models and aliases | 5m fresh / 5m stale |
| Provider incidents | OpenAI, Anthropic, and xAI status aggregation | 10m fresh / 10m stale |

Collections are not a web consumer dependency. The legacy derived route remains
Worker-owned until its removal is confirmed independently.

### Global search bootstrap

- The header warms `/api/_web/search` during browser idle time after the first
  page load and on pointer/focus intent. It is not embedded in the RSC payload.
- A static Navigation group indexes 63 public and authenticated destinations,
  including catalogue, gateway, updates, tools, and settings pages. Navigation
  matching is available immediately and adds no Worker or database request.
- The same `Ctrl+K` surface is a local-first command palette. `>` scopes to
  actions, `/` to navigation, `@` to models, and `?` to external resources.
  Two-key aliases (for example `G M` for Models and `T T` for theme) execute
  outside editable controls without a network lookup.
- Actions cover chat/compare and common creation flows, clipboard utilities,
  light/dark/system theme controls, documentation, API reference, quickstart,
  GitHub, status, and issue reporting. Model detail pages add chat, compare,
  and copy-model-ID commands from the current URL.
- Any destination or action can be pinned. Pins are capped, versioned, and
  stored only in browser local storage; reading and ID lookup are cached in
  memory, so pinning and command execution add no Worker or Vercel traffic.
- The Cloudflare route returns one compact tuple-based index, stays in the
  browser cache for 24 hours, and is deduplicated for the lifetime of the web
  application. Normal navigation therefore causes at most one Cloudflare
  request per browser per day and no Vercel origin transfer for search.
- `get_public_search_index()` composes the complete index as one PostgreSQL
  JSON value. This removes four Worker-to-database requests and avoids the
  PostgREST 1,000-row limit that previously truncated the model index.
- Until the SQL migration is deployed, the Worker compatibility path pages
  through every visible model and preserves the same compact response shape.

### Cache Control Centre and browser freshness

- `/internal/cache` is an admin-only Cloudflare cache control surface. The
  browser sends the signed-in Supabase access token directly to private,
  no-store Worker routes; Cloudflare API credentials are never shipped to the
  browser and Vercel does not proxy the purge.
- The UI exposes named scopes rather than arbitrary tags. Search, catalogue,
  model, provider, organisation, benchmark, app, landing, ranking, update, and
  pricing scopes resolve to a centrally maintained tag registry. The
  incident-only all-public scope requires typed confirmation and remains below
  Cloudflare's 100-operation purge limit.
- Every manual purge attempt is recorded in `web_cache_purge_events`, including
  its resolved tags, optional target, actor, outcome, and browser generation.
  The latest 25 events and current generation are visible in the Web UI.
- Search-aware purges can atomically advance the `search` generation in
  `web_cache_generations`. The compact search payload includes that generation,
  so its initial load does not require a second version request.
- Returning to a tab after at least five minutes permits one tiny
  `/api/_web/cache-generation/search` check. Checks are module-deduplicated and
  throttled to at most once per 15 minutes; ordinary navigation never triggers
  one. Only a newer generation downloads `/api/_web/search?generation=N`, whose
  versioned URL bypasses an older browser-cached object.
- The generation marker has a zero browser TTL and a five-minute Cloudflare
  edge TTL. It can therefore revalidate cheaply at the edge without invoking
  the Worker for every returning browser, while a purge of its cache tag makes
  a new generation discoverable immediately at the edge.
- On internal data-editor routes, Ctrl+K exposes the Cache Control Centre and a
  context-aware link prefilled for the current model, provider, organisation,
  or benchmark. The command opens the confirmation UI; it never executes a
  destructive purge directly from the palette.
- Admins can summon a global developer menu with Ctrl/Cmd+Shift+Period. The
  launcher is dormant and does not check authentication or load the menu chunk
  until the shortcut is used. Once the Worker has confirmed the user's current
  admin role, the menu maps the current public route to a named cache scope and
  requires confirmation before revalidation. The Worker remains the security
  boundary and rejects cross-site browser requests in addition to requiring a
  bearer token and a fresh database role check.
- The public model-page edit pencil is intentionally hidden during this
  migration. The existing editor routes remain available for later restoration;
  the model detail page no longer performs editor authorization work merely to
  decide whether to render that affordance.

### Database-first model projections

- `/api/_web/models?shape=page&projection=5` returns the final virtualized-list
  row contract, filter facets, pricing summaries, and the `phaseo/free` virtual
  model. PostgreSQL owns the catalogue joins and pricing aggregation; the
  Worker owns the final public projection. Next no longer rebuilds gateway
  metadata, re-enriches complete pricing, fetches the free-router separately,
  or merges its facet counts across the full catalogue.
- `get_public_models_page_rows()` is the preferred database projection. The
  compatibility Worker composer remains only for environments where that
  migration has not landed.
- `get_public_free_router_overview()` aggregates eligibility and 30-day usage
  in PostgreSQL. A partial `phaseo/free` request index supports that lookup;
  the Worker retains a pre-migration fallback.
- `/api/_web/compare/selection` replaces four stable-data requests per selected
  model with one cacheable, batched Worker response. Provider/capability/pricing
  sources and subscription plans are queried in batches and composed once in
  the Worker.
- `/api/_web/compare/usage` replaces three telemetry requests per selected
  model with one 5-minute Worker response. Realtime percentiles are aggregated
  by `get_public_compare_realtime()` rather than materializing raw gateway
  requests in Next; existing performance and trajectory RPCs are composed in
  the Worker. The old request fan-out is retained only as a deployment-order
  compatibility fallback.

## Migrated authenticated reads

Existing account routes cover session/header/status/Statsig, credits,
workspace settings bootstrap data, profile, teams, usage logs/observability and
alerts, plus admin model/catalogue audit sources. These routes verify the access
token inside the Worker and verify workspace membership or global admin role as
appropriate.

Browser Supabase auth calls are an explicit transport exception, not a data
ownership exception: the browser/server auth client may obtain or revoke a
session, but application table reads must go through the Worker.

## Residual migration queue

The repository-wide residual audit is tracked in this order:

1. Live gateway-usage pagination, charts, sessions, jobs, generation
   investigation, and async-operation details are authenticated account Worker
   routes. The legacy server-action module is transport-only.
2. Internal model/catalogue editor mutations and advanced audit actions are
   admin-only Worker routes followed by Workers Cache tag invalidation.
3. Settings reads and mutations are Worker-owned, including keys, teams, OAuth
   apps, presets, BYOK, guardrails, broadcast destinations, webhooks, routing,
   apps, beta, credits, profile data, and recovery codes.
4. Billing documents/refunds, Stripe webhook processing, onboarding, OAuth
   consent, post-login lifecycle, compatibility validation, gateway
   benchmarking, and every chat/playground proxy are explicit no-store Worker
   routes.
5. Web and YouTube watchers are Worker-owned scheduled handlers. They run every
   30 minutes, write through the Worker service-role client, and purge the
   affected updates cache tags after successful ingestion.

The residual queue is empty. Supabase use retained in the web application is
limited to session/authentication transport (session retrieval, password/MFA
operations, and sign-out); it does not read or mutate application tables.
The service-role helper under `apps/web/src/utils/supabase/admin.ts` is retained
only for explicitly invoked offline maintenance/import scripts and has no
application-runtime importer.

No item above may use shared caching. Mutations that affect public catalogue
data must purge the relevant Cloudflare cache tags after a successful commit.

## Completion gates

The goal is complete only when:

1. The final repository audit has zero unclassified application table/RPC
   access in `apps/web`.
2. Every retained Supabase usage is documented as auth transport only.
3. Every private route has auth tests and `private, no-store` assertions.
4. Every public route has cache/failure tests and a cache-tag invalidation path.
5. Local, staging, and production bindings/origins/secrets are documented and
   smoke tested.
6. Web and Worker typechecks/tests/builds and Wrangler deploy dry-run pass.

## Final verification (2026-07-17)

- Audit: 112 non-test fetcher files, zero application table/RPC calls, zero
  Next `app/api` files, and zero runtime importers of the maintenance-only
  Supabase admin client.
- Worker: 31 test files / 160 tests passed; ESLint completed with zero errors
  (three existing file-length warnings); TypeScript passed; production and
  staging Wrangler deploy dry-runs passed.
- Web: 74 test suites / 330 tests passed; TypeScript passed; the optimized
  Next production build passed with Cache Components enabled.
- Local integration: the Worker started on `127.0.0.1:8788`, the web app
  started on `127.0.0.1:3105`, `/models` returned 200, the Vercel-development
  rewrite returned the Worker model response, a repeated model request reported
  a cache hit, and anonymous account/chat/internal requests returned private,
  no-store authorization responses.

Cache-control follow-up verification on the same date:

- Worker: 38 test files / 180 tests passed and TypeScript passed. Coverage
  includes named-scope resolution, Cloudflare's 100-operation ceiling, the
  generation response cache contract, and private unauthenticated admin-route
  failures.
- Web: 79 test suites / 349 tests passed and TypeScript passed. Focused lint
  completed with zero errors; the three remaining Search warnings are the
  existing image, file-length, and TanStack Virtual compiler warnings.
- Browser: a fresh hydrated `/models` load made one `/api/_web/search` request.
  SPA navigation from Models to Providers and back left that count at one and
  made zero generation requests. The five-minute away threshold, 15-minute
  check throttle, and generation-specific search key have deterministic unit
  coverage.
