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
