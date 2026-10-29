# Architecture

Phaseo is an AI gateway and a public model catalogue. One API at `api.phaseo.app` accepts OpenAI
and Anthropic wire formats and routes each request to one of many upstream providers. The web app
at `phaseo.app` shows the catalogue, the dashboard and the playground. The database owns the
catalogue and every account fact; Workers serve the request path from caches so Postgres stays off
the hot path wherever it can.

This page covers boundaries, their reasons, and traps that are hard to see from the source. Terms
are in the [glossary](./glossary.md); setup and deploys are in [operations](../operations/development.md).

## System map

| Component | Path | Runs on | Owns |
| --- | --- | --- | --- |
| Gateway API | [`apps/api`](../../apps/api) | Cloudflare Workers: `phaseo-gateway` at `api.phaseo.app`, plus EU and US regional Workers | The public `/v1` API, the Management API, OAuth, scheduled jobs, the Broadcast queue consumer and the gateway Durable Objects |
| Web app | [`apps/web`](../../apps/web) | Vercel (Next.js App Router) | Public pages, dashboard, playground UI and the admin catalogue editor (`/internal/data`) |
| Web API | [`apps/web-api`](../../apps/web-api) | A Cloudflare Worker on `phaseo.app` routes: `/api/_web/*`, `/api/account/*`, `/api/chat/*`, `/api/internal/*`, `/scim/v2/*` | Cached public data for the web app, account reads and writes, the playground proxy, SCIM, provider catalogue feeds, Slack agent installs, settings and charges |
| MCP server | [`apps/mcp`](../../apps/mcp) | Cloudflare Worker at `mcp.phaseo.app` | Read-only catalogue and usage tools over Phaseo OAuth, reviewed inference, and opt-in account management |
| Slack agent | [`apps/slack`](../../apps/slack) | Cloudflare Worker at `slack.phaseo.app` | Slack events and interactions, one agent turn at a time per thread, shared pages and recurring tasks; it answers through the gateway |
| Docs | [`apps/docs`](../../apps/docs) | Mintlify, deployed from `main` by its GitHub app | Guides and API reference in nine languages, published agent skills |
| Desktop, mobile, Factory | [`apps/desktop`](../../apps/desktop), [`apps/mobile`](../../apps/mobile), [`apps/factory`](../../apps/factory) | Electron; Expo; Electron | Client apps. CI does not deploy them |
| SDKs | [`packages/sdk`](../../packages/sdk) | Package registries such as npm and PyPI | Nine generated SDKs, their handwritten wrappers, and Agent SDKs |
| Database | [`supabase`](../../supabase) | Supabase Postgres | Schema definitions, forward migrations, `pg_cron` jobs |
| Other packages | [`packages`](../../packages) | Build time or registries | The `phaseo` CLI, the in-house OpenAPI generator (`openapi`, `openapi-backends`), AI SDK providers, integrations, shared registries and the provider mock |

The web app calls the Web API on its own origin: Cloudflare routes those paths to the Worker before
Vercel sees them. In local development and on Vercel previews,
[`next.config.mjs`](../../apps/web/next.config.mjs) rewrites them to `WEB_API_ORIGIN`, or to
production `https://phaseo.app` when it is unset. A push to `main` applies database migrations,
then [CI](../../.github/workflows/ci.yml) deploys every Worker and the web app. A failed migration job blocks all of those deploys.

## Life of a gateway request

Each inference route binds an endpoint name and a Zod schema to `makeEndpointHandler` in
[`pipeline/index.ts`](../../apps/api/src/pipeline/index.ts), which runs a before stage, a
per-endpoint surface and an after stage inside a model-fallback loop. Paths are under `apps/api/src`.

1. **Edge.** [`index.ts`](../../apps/api/src/index.ts) sets `x-request-id` and applies
   [`regional-surface.ts`](../../apps/api/src/regional-surface.ts), which limits regional Workers to
   text generation, `/v1/models` and health. Data-plane routes are in
   [`routes/v1/data`](../../apps/api/src/routes/v1/data); control-plane routes load lazily.
2. **Authentication.** [`before/auth.ts`](../../apps/api/src/pipeline/before/auth.ts) checks an HMAC
   of the key secret and caches key rows in KV and isolate memory. Management keys are rejected;
   OAuth delegated keys re-check their authorization on every request. A Vercel or GitHub Actions
   OIDC token that matches a workload identity policy acts as that policy's secretless key
   ([`before/workload-identity-auth.ts`](../../apps/api/src/pipeline/before/workload-identity-auth.ts)).
3. **Parse and resolve.** [`before/index.ts`](../../apps/api/src/pipeline/before/index.ts) strips the
   `models` list ([`requestModelFallbacks.ts`](../../apps/api/src/pipeline/before/requestModelFallbacks.ts)),
   validates the body ([`core/schemas.ts`](../../apps/api/src/core/schemas.ts)) and resolves presets
   (`@slug`), provider-qualified models (`provider:org/model`), `phaseo/auto` and `phaseo/free`.
4. **Context.** `guardContext` ([`before/guards.ts`](../../apps/api/src/pipeline/before/guards.ts),
   through [`before/context.ts`](../../apps/api/src/pipeline/before/context.ts)) loads key limits,
   the credit snapshot, settings, candidate routes and prices. Public catalogue data comes from a
   cached snapshot ([`contextBundle.ts`](../../apps/api/src/pipeline/before/contextBundle.ts));
   workspace data is cached under a workspace version token and reloaded through RPCs such as
   `gateway_fetch_request_context_bundle`.
5. **Policy and capability checks.** Dynamic routes, presets, the `routing` object
   ([`requestRouting.ts`](../../apps/api/src/pipeline/requestRouting.ts)), data policy, guardrails and
   service tiers narrow the candidates. [`capabilityValidation.ts`](../../apps/api/src/pipeline/before/capabilityValidation.ts)
   rejects unsupported parameters before any provider is called ([parameter support](../../apps/api/docs/params-jsonb-schema.md)).
6. **Unserved models.** If no provider serves the model, the request's `models` list is tried
   first. An approved successor ([`modelSuccessor.ts`](../../apps/api/src/pipeline/before/modelSuccessor.ts))
   stands in only for the last model tried, and only if the workspace turned redirects on.
7. **Surface.** [`registry.ts`](../../apps/api/src/pipeline/registry.ts) picks a runner in
   [`pipeline/surfaces`](../../apps/api/src/pipeline/surfaces). Chat Completions, Responses and
   Messages share [`text-generate.ts`](../../apps/api/src/pipeline/surfaces/text-generate.ts): decode
   into the IR ([`protocols`](../../apps/api/src/protocols), [`core/ir.ts`](../../apps/api/src/core/ir.ts)),
   check the response cache, execute, encode. Batches and realtime have their own routes.
8. **Execute.** [`execute/index.ts`](../../apps/api/src/pipeline/execute/index.ts) ranks candidates
   ([`execute/routing.ts`](../../apps/api/src/pipeline/execute/routing.ts) weighs success rate,
   latency, throughput and price by routing mode), builds a credential plan from BYOK keys and the
   managed key, admits rate limits and calls `resolveProviderExecutor(providerId, capability)` from
   [`executors`](../../apps/api/src/executors). A retryable failure fails over to the next provider
   for the same model. See [provider executors](../../apps/api/docs/provider-executor-architecture.md).
9. **After.** [`pipeline/after`](../../apps/api/src/pipeline/after) prices usage, charges once
   ([`after/charge.ts`](../../apps/api/src/pipeline/after/charge.ts)), streams through
   [`protocols/stream/encode.ts`](../../apps/api/src/protocols/stream/encode.ts), and writes the
   `gateway_requests` row and its `v2_request_facts` extension ([`pipeline/audit`](../../apps/api/src/pipeline/audit)).
   Opt-in payload logs go to R2; telemetry goes to Axiom and workspace Broadcast destinations.
10. **Model fallback.** Separately from provider failover, a final 429, 500, 502, 503 or 504 reruns
    the pipeline from the before stage with the next model. Dynamic-route fallbacks win over the
    request `models` list, which wins over auto-router fallbacks. A rate-limit policy rejection stops
    the chain.

Text requests carry no wallet hold: they are admitted against a credit snapshot and charged after
the response. Batches and video reserve credits at creation
([`core/wallet-reservations.ts`](../../apps/api/src/core/wallet-reservations.ts)) and later capture,
release or settle; realtime sessions keep their own extendable hold. The `*_once` billing RPCs are
idempotent per request or reservation, so a repeated finalise path cannot charge twice.

## Catalogue data

The database is the only source of truth for models, organisations, providers, routes, aliases,
families, pricing, benchmarks and subscription plans. Admins edit it in the catalogue editor
(`apps/web/src/app/[locale]/(dashboard)/internal/data`). Provider feeds polled by the Web API queue
changes for review. The repository holds no catalogue JSON and nothing exports the database to it;
tests use small inline fixtures.

The gateway never reads catalogue tables per request. Each minute its cron publishes
`gateway_catalogue_revision()` to KV ([`core/catalogue-revision.ts`](../../apps/api/src/core/catalogue-revision.ts)).
Snapshots are served stale-while-revalidate by [`core/tiered-cache.ts`](../../apps/api/src/core/tiered-cache.ts)
(isolate memory, Workers cache, KV) and refresh when the revision changes. Database triggers queue
`gateway_workspace_publications` when workspace settings change, from any writer;
[`scheduled/workspace-publications.ts`](../../apps/api/src/scheduled/workspace-publications.ts)
drains them each minute to invalidate cached workspace contexts.

The web app reads public data from Web API `/api/_web/*` routes
([`lib/web-api/client.ts`](../../apps/web/src/lib/web-api/client.ts)) with Next's data cache off;
Cloudflare's cache owns freshness and tags ([`apps/web-api/src/cache`](../../apps/web-api/src/cache)).
Dashboard and admin pages use Supabase from server modules with Next cache tags
([`lib/cache`](../../apps/web/src/lib/cache)). A catalogue change can therefore be stale in three
places: Next tags, Web API cache tags and gateway snapshots.

## Public contract chain

[`apps/docs/openapi/v1/openapi.yaml`](../../apps/docs/openapi/v1/openapi.yaml) is the one v1
contract for the docs and every SDK. Internal operations stay in it, marked `x-internal: true` and
`x-excluded: true`; there is no filtered copy.

1. The model, organisation and benchmark enums (`KnownModelId`, `OrganisationId`, `BenchmarkId`) are
   edited by hand in the spec. [`generate-model-id-constants.mjs`](../../scripts/sdk/generate-model-id-constants.mjs)
   turns `KnownModelId` into the SDKs' model-ID helpers.
2. `pnpm openapi:gen` runs the generator in `packages/openapi`, one backend per language, and
   rewrites the generated code of the TypeScript, Python, Go, C#, Java, PHP, Ruby, C++ and Rust SDKs.
   Wrapper parity is listed in [`core-contract.json`](../../packages/sdk/core-contract.json).
3. Mintlify renders the English API reference from the spec.
   [`generate-localized-openapi.mjs`](../../apps/docs/scripts/generate-localized-openapi.mjs) overlays
   [`localized-copy.json`](../../apps/docs/openapi/localized-copy.json) to write
   `apps/docs/<locale>/openapi/v1/openapi.localized.yaml` for ar, de, es, fr, hi, ja, pt-BR and
   zh-Hans, and fails if a translation changes protocol data. These copies never feed SDKs.
4. Skills are edited in [`.agents/skills`](../../.agents/skills). `pnpm skills:sync`
   ([`scripts/skills/sync.mjs`](../../scripts/skills/sync.mjs)) copies the public skills listed in
   [`public-skills.mjs`](../../scripts/skills/public-skills.mjs) to `apps/docs/.mintlify/skills` and
   `apps/mcp/plugin/phaseo/skills`, and every skill, internal ones included, to `.claude/skills`,
   the only place Claude Code finds project skills. `pnpm skills:check` fails CI when a copy is stale.

## Asynchronous work

- **Gateway cron.** `phaseo-gateway` runs [`scheduled/index.ts`](../../apps/api/src/scheduled/index.ts)
  every minute: catalogue revision and workspace publications on every tick; reconciliation, webhook
  retries, email and notification delivery, rollups and retention every fifth minute; model
  discovery on its own cadence. Regional Workers and staging run no cron. The scheduled-only
  `phaseo-jobs` Worker ([`wrangler.jobs.toml`](../../apps/api/wrangler.jobs.toml)) has an empty
  schedule and is not deployed by CI.
- **Other schedulers.** The Web API's minute cron polls provider catalogue feeds and charges for the
  Slack agent; the Slack agent Worker's minute cron starts due recurring tasks. `pg_cron` jobs in
  [`_cluster/misc.sql`](../../supabase/schemas/_cluster/misc.sql) refresh rollups and health and
  create partitions. GitHub Actions run the provider catalogue, model status and benchmark syncs.
- **Durable Objects and queues.** `phaseo-gateway` owns five Durable Objects (realtime relay,
  provider and customer rate limits, spend limits, routing health); the regional and jobs Workers
  bind them by `script_name`. The realtime relay holds the provider WebSocket so a client disconnect cannot skip
  final usage. The `phaseo-broadcast` queue feeds [`broadcast-queue.ts`](../../apps/api/src/observability/broadcast-queue.ts).
- **Batches and async operations.** Video, batch and music jobs are `gateway_async_operations` rows
  ([`core/async-operations.ts`](../../apps/api/src/core/async-operations.ts)). The cron polls
  providers, provider webhooks are stored once per event ([`provider-events.ts`](../../apps/api/src/core/provider-events.ts)),
  and [`batch-finalization.ts`](../../apps/api/src/core/batch-finalization.ts) prices the output
  JSONL and charges once. [`async-notifications.ts`](../../apps/api/src/core/async-notifications.ts)
  sends signed events to customer webhook endpoints and retries failures.

## Constraints and traps

- **Workers runtime.** The gateway enables `nodejs_als` but not `nodejs_compat` (the Web API, MCP
  and Slack agent Workers enable it), so gateway code cannot use Node built-ins.
  `global_fetch_strictly_public` blocks private addresses. An invocation gets six concurrent
  outbound connections; KV takes about one write per second per key.
- **Background work belongs to its request.** Use `dispatchBackground` from
  [`runtime/env.ts`](../../apps/api/src/runtime/env.ts). Workers cancel pending I/O when its request
  ends, so billing or audit work attached to another request can be dropped.
- **Shared caches cannot be purged per colo.** Invalidate with a version in the key or a published
  revision. Keep secrets, credentials and wallet balances out of shared cache layers.
- **Changes propagate; they do not apply.** A revoked key can work for about 30 seconds. Catalogue,
  workspace and rate-limit policy changes take a minute or more. Customer rate limits admit first
  and count in a Durable Object, so in-flight requests can pass a limit. Policy concurrency limits
  and strict policies wait for the object instead, and policy tokens per minute are charged after
  each request completes. Read the header of
  [`core/rate-limit-policies.ts`](../../apps/api/src/core/rate-limit-policies.ts) first.
- **Billing must survive every exit.** Charges retry idempotently. A provider rate-limit reservation
  is released only if nothing was sent upstream, because a failed dispatch can still cost tokens. A
  dispatched video create is never retried on another provider. On client disconnect the gateway
  drains the upstream stream rather than cancelling it, because a cut stream usually loses its usage
  frame ([`stream-cancellation.ts`](../../apps/api/src/pipeline/after/stream-cancellation.ts)). Money
  is integer USD nanos (10⁹ per dollar) in JavaScript numbers ([`money.ts`](../../apps/api/src/pipeline/pricing/money.ts)).
- **Aggregate in SQL.** PostgREST returns at most 1,000 rows, so summing a query result in JavaScript
  silently undercounts. Aggregate or page in an RPC, and check `error` on every Supabase call.
- **`workspace_id`, not `team_id`.** Teams were renamed to workspaces, but some functions and views
  keep `team_id` or `p_team_id`. RPC arguments match by name: callers passed `p_workspace_id` to a
  `p_team_id` function, swallowed the error, and deprecation alerts matched no workspace. That
  function's `is_workspace_member()` guard also failed, because `auth.uid()` is null for
  service-role callers such as the gateway, the Web API and cron jobs.
- **Migrations are forward-only.** Edit [`supabase/schemas`](../../supabase/schemas), generate SQL with
  `pnpm db:schema:sync` and commit both. Existing migrations are immutable, a new version must sort
  after `main`'s latest, and destructive SQL needs an approval comment
  ([`validate-supabase-migrations.mjs`](../../scripts/validate-supabase-migrations.mjs)). SQL applied
  to production under a version with no committed file stops every deploy
  ([`supabase/README.md`](../../supabase/README.md)).
- **Three names for one operation.** The gateway `Endpoint` (`chat.completions`), the routing
  capability (`text.generate`) and the HTTP path differ. Database writes normalise capabilities with
  `canonical_routing_capability_id()`; [`capabilityToEndpoints.ts`](../../apps/api/src/lib/config/capabilityToEndpoints.ts)
  maps them in code.
- **Many status fields.** Model `status` and `catalogue_status` and four route fields answer
  different questions; see the [glossary](./glossary.md#catalogue). Only `routing_enabled` (legacy
  `is_active_gateway`) makes a route callable.
- **Bare Mintlify `openapi:` references.** `openapi: "POST /chat/completions"` resolves against the
  alphabetically first spec, a localised one, so English pages once rendered Arabic. Name the spec
  file; `validate:locales` enforces it.
- **Public repository, generated output.** Follow the [public documentation policy](../../apps/api/docs/public-documentation-policy.md).
  Never hand-edit generated SDK code or snapshots; fix the source and regenerate.
- **CI runs few unit tests.** CI runs one of 816 gateway Vitest files and three of 429 web Jest
  files; run the ones for code you change ([what CI covers](../operations/development.md#what-ci-covers)).

## Where to go next

- [Glossary](./glossary.md), the [developer docs index](../README.md), [development](../operations/development.md),
  [production access](../operations/production-access.md) and [releases](../operations/release.md)
- Gateway: [provider executors](../../apps/api/docs/provider-executor-architecture.md),
  [database-driven adapters](../../apps/api/docs/database-driven-provider-adapters.md),
  [catalogue status](../../apps/api/docs/catalogue-status-model.md), [v2 data model](../../apps/api/docs/v2-data-model.md),
  [geographic availability](../../apps/api/docs/provider-geographic-availability.md),
  [regional Workers](../../apps/api/docs/internal/regional-deployment.md)
- Database: [`supabase/AGENTS.md`](../../supabase/AGENTS.md), [declarative schemas](../../supabase/DECLARATIVE-SCHEMAS.md),
  [subscription catalogue](../../supabase/STRUCTURED-SUBSCRIPTIONS.md)
- Localisation: [architecture](../architecture/localisation.md), [web](../../apps/web/LOCALISATION.md),
  [docs](../../apps/docs/TRANSLATION_WORKFLOW.md)
- Area rules in `AGENTS.md`: [`apps/api`](../../apps/api/AGENTS.md), [`apps/web`](../../apps/web/AGENTS.md),
  [`apps/docs`](../../apps/docs/AGENTS.md), [`packages/sdk`](../../packages/sdk/AGENTS.md)
