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

## Staging

`pnpm exec wrangler deploy --env staging` deploys the gateway as
`phaseo-gateway-staging` on the account's `workers.dev` subdomain. It has no
`api.phaseo.app` route, uses the separate `GATEWAY_CACHE_STAGING` namespace,
and has no cron triggers. Scheduled discovery, reconciliation, invoice, and
pricing-monitor work is disabled there.

The PR workflow deploys this environment automatically. Provision the gateway
secrets on the `staging` environment separately from production; do not reuse
the production cache or attach the production custom domain. The staging
database configuration currently matches the shared Supabase project, so
request paths which write customer or billing data must remain off-limits until
a separate Supabase staging project is introduced.
