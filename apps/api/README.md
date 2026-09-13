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

The Linear team, project, Triage status, assignee, and observability label IDs
are non-secret deployment variables in `wrangler.toml`. Configure these Worker
secrets before enabling either webhook destination:

- `OBSERVABILITY_WEBHOOK_SECRET`: at least 32 random characters, sent as a
  bearer token by Axiom and PostHog.
- `LINEAR_API_KEY`: a Linear API key allowed to create issues and comments.

The endpoint accepts only a bounded, privacy-safe incident envelope. Do not send
request bodies, authorization headers, query values, cookies, or customer
content. Keep source payload templates and the rollout checklist in the private
deployment issue rather than the public documentation tree.

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
