# Phaseo Gateway API

The Phaseo Gateway is the API layer that connects multiple AI providers behind one unified interface. It runs on Cloudflare Workers with Hono and powers the Phaseo gateway, routing, pricing, and observability surface.

## Purpose

The gateway lets developers access models from OpenAI, Anthropic, Google, Mistral, and other providers through one endpoint. It is designed to keep routing, cost visibility, provider behavior, and model metadata predictable across providers.

## What It Does

- Routes requests across supported providers.
- Tracks latency, tokens, cost, and request metadata.
- Syncs events and analytics into Supabase-backed product views.
- Supports model metadata, pricing, benchmarks, and provider coverage.
- Exposes OpenAI-compatible endpoints plus Phaseo-specific controls.

For Microsoft Decision deployment and credential mapping, see [Azure decisions](docs/provider-executor-architecture.md#azure-decisions).

## Architecture

- Runtime: Cloudflare Workers
- Framework: Hono and TypeScript
- Database: Supabase
- Logging: Axiom
- Monitoring: server timing, structured events, and dashboards

## Regional provider routing

The gateway has optional EU and US deployments:

- `https://eu.api.phaseo.app`
- `https://us.api.phaseo.app`

Their deployment-owned `GATEWAY_ROUTING_REGION` value is applied as both an
execution-region and data-region requirement after request, preset, and dynamic
route configuration has been merged. A conflicting request is rejected, and an
empty compliant provider pool fails closed instead of falling back globally.

These deployments use Cloudflare Workers placement hints and regional provider
metadata. They are **not end-to-end data residency guarantees**: Supabase, KV,
Workers logs, provider subrequests, and other dependencies are not yet proven to
remain in-region. Do not describe this feature as guaranteed residency until the
complete data path has been audited and Cloudflare Regional Services is enabled.

The regional configs intentionally have no cron triggers, R2 logging buckets,
data-contribution buckets, or realtime Durable Object binding. Async and
background surfaces need a separate residency review before being enabled.
`/v1/models` is filtered by the deployment region and only advertises the three
text endpoints supported by the regional deployments. The initial regional
surface accepts text-only Chat Completions, Responses, and Messages requests;
non-text content, non-text output, hosted tools, and other endpoints fail before
provider execution.

Validate both deployments without publishing them:

```bash
pnpm --filter @phaseo/gateway-api build:regional
```

Before deployment, provision the same required gateway secrets separately for
`phaseo-gateway-eu` and `phaseo-gateway-us`. Provider credentials must point to
the regional offers represented by the provider catalog.

See [docs/internal/regional-deployment.md](docs/internal/regional-deployment.md) for the complete
Cloudflare setup, secret preparation, deployment, and non-inference verification
runbook.

## Workspace invite secrets

Workspace invite management requires `INVITE_ENCRYPTION_KEY` and
`HMAC_ENCRYPTION_KEY` on both the Gateway Worker and the web API. Use the same
values in both runtimes so dashboard-created and management-API-created invites
remain interoperable.

- `INVITE_ENCRYPTION_KEY`: base64-encoded 32 random bytes.
- `HMAC_ENCRYPTION_KEY`: base64-encoded random key material of at least 32 bytes.

Store both as deployment secrets. Never place their values in `wrangler.toml`,
logs, API responses, or committed environment files.

## Observability incident triage

`POST /internal/observability-incidents` accepts normalized PostHog and Axiom
signals and creates deduplicated issues in Linear Triage. The Worker stores the
source fingerprint-to-issue mapping in `GATEWAY_CACHE`, suppresses repeat
comments for 15 minutes, and comments when an Axiom signal resolves.

KV has no compare-and-set and its reads can be up to a minute stale, so the
mapping alone cannot stop two deliveries of the same signal from both creating
an issue. Each issue and comment is therefore created with a UUID derived from
the fingerprint (comments also from the 15-minute window). Linear refuses a
second entity with the same ID; the losing delivery looks the entity up and
reuses it. Mappings written before this change keep pointing at their issues.

The Linear team, project, Triage status, assignee, and observability label IDs
are non-secret deployment variables in `wrangler.toml`. Configure these Worker
secrets before enabling either webhook destination:

- `OBSERVABILITY_WEBHOOK_SECRET`: at least 32 random characters, sent as a
  bearer token by Axiom and PostHog.
- `LINEAR_API_KEY`: a Linear API key allowed to create issues and comments.

The endpoint accepts only a bounded, privacy-safe incident envelope. Do not send
request bodies, authorization headers, query values, cookies, person properties
or customer content. The bridge also strips query strings from routes and URLs,
and replaces emails and long key-like tokens in titles and exception summaries.
Keep the webhook URL's secret and the rollout checklist in the private
deployment issue; the PostHog payload template is below because it holds
neither.

### PostHog producer

The PostHog destination is an HTTP Webhook on `$exception` events. Its JSON
body is
[`observability-incidents.posthog-body.json`](src/routes/internal/observability-incidents.posthog-body.json);
paste it as the body, keep the existing `Authorization: Bearer …` header, and
keep any environment filters the destination already has. A contract test fails
if the template sends a field the bridge does not read.

- `fingerprint` is `$exception_fingerprint`, the same key earlier incidents
  used, so existing mappings keep deduplicating. It is not the error group: the
  group ID (`$exception_issue_id`) appears only in the `source_url` link. If
  PostHog merges two fingerprints into one group, Linear keeps two issues.
- `title` and the exception summary come from the first entry of
  `$exception_list` (type and message). Stack frames are not sent; open the
  error group for them.
- `route` and `release` come from the `path` and `release` properties set by
  `apps/web` (`errorReproductionContext.ts` in the browser,
  `instrumentation.ts` on the server).
- `replay_url` is sent only when the event has a `$session_id`. A session ID
  does not mean a recording exists: recording starts only after analytics
  consent, PostHog project settings (sampling, minimum duration, triggers) can
  skip a session, and recordings expire. Inputs and Chat (`.ph-mask`) are
  masked by design. The issue text says the replay may be missing.

To check the mapping without creating an issue, run the destination's test in
PostHog against a recent `$exception` event with async functions mocked, so
nothing is sent. The logged request body should have a
128-character `fingerprint`, a `source_url` ending in
`/error_tracking/<group id>`, and `null` for fields the event lacks. A real
end-to-end check creates a Linear issue, so do it only with maintainer
approval: accept analytics cookies on a page, trigger a synthetic error with no
customer data, confirm the Linear issue and replay, then repeat the error more than 15
seconds later (the browser drops identical errors within 15 seconds) and
confirm that it adds no second issue.

## Useful Links

- API docs: https://phaseo.app/docs/v1/api-reference/introduction
- Product: https://phaseo.app
- GitHub: https://github.com/phaseoteam/Phaseo
- Support: https://phaseo.app/contact

## Contributing

This is the right place to improve routing, pricing, provider adapters, caching, observability, and API behavior.

Common contribution areas:

- Add providers or endpoint coverage.
- Improve request normalization and response mapping.
- Tighten type safety and validation.
- Expand model, provider, and pricing metadata.
- Improve performance, caching, and reliability.

## Scheduled Worker cutover

`src/jobs.ts` and `wrangler.jobs.toml` prepare a scheduled-only `phaseo-jobs`
Worker. Its cron starts disabled. The gateway continues scheduling until an
explicit production cutover. This separates invocation metrics; it does not
by itself reduce total CPU.

The jobs Worker shares the existing KV and R2 resources and binds to the
gateway's existing Durable Objects through `script_name`. It creates no new
Durable Object storage or migrations. Secrets do not transfer between Workers.

The PR is based on current main and preserves its discovery configuration:
`MODEL_DISCOVERY_SHARDING_ENABLED=false` and `MODEL_DISCOVERY_CONCURRENCY=8`.
The original investigation checkout was older and always sharded; its gateway
configuration was not copied into this PR. Sharding changes remain separate
from provisioning the jobs Worker.

1. Validate with `pnpm --filter @phaseo/gateway-api build:jobs` and the scheduled
   and model-discovery tests. Review bindings and required secrets for each job.
2. Provision `phaseo-jobs` with `crons=[]`, supply its required secrets through
   the established secret-management process, and verify all bindings.
3. In the reconciled gateway configuration, set `crons=[]` and deploy that
   gateway change. Keep its scheduled export available during the transition.
4. Wait for Cloudflare's cron update to propagate (up to 15 minutes according
   to [Cloudflare's documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/)) and confirm the gateway no
   longer receives scheduled invocations before enabling the jobs cron.
5. Change the jobs configuration to `crons=["* * * * *"]`, deploy it, and
   verify scheduled execution, notification delivery, and outbox draining.
   Observe the two Workers separately over a full discovery cadence.
6. Remove the gateway's scheduled export/import in a follow-up after cutover.

Rollback: disable the jobs cron, confirm it has stopped, then restore the
gateway cron. Never enable both schedules simultaneously. The handoff can
delay maintenance; confirm delayed work is recovered from persisted outboxes
and reconciliation queues.

Pricing-page scraping still runs in the jobs Worker. Moving it to GitHub
Actions needs a separate change preserving notification deduplication and the
rule that pricing baselines advance only after notification delivery succeeds.
Likewise, reducing fingerprints to token prices alone would lose supported
non-token pricing alerts; the sort optimization preserves those alerts.
