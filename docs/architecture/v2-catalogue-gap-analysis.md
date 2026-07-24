# v2 catalogue coverage and gap analysis

Reviewed 2026-07-22 against the models.dev v2 API proposal in issue #3037 and
the current public models.dev provider registry.

## What v2 now represents

The JSON contract and database can now represent:

- canonical model slugs, lifecycle dates, replacement references, families,
  limits, modalities, reasoning options, capability flags, open-weights status,
  sources, and verification state;
- provider status, global routing switches, gateway/aggregator classification,
  SDK/API metadata, regions, service tiers, and non-routable catalogue-only
  offers;
- provider/model route status, regional variants, service tiers, API invocation
  metadata, rate-limit placeholders, capability evidence, and per-meter pricing;
- regional and conditional pricing, including a dedicated cache-duration field;
- SQL-owned model catalogue, overview, routing-candidate, and provider-region
  read contracts.

## What is still incomplete

The fields are deliberately explicit, but many are currently `null` or empty.
They need evidence-backed enrichment before they are treated as facts:

1. **Exact modalities.** Existing `input_types`/`output_types` are broad
   categories. The new `modalities` fields currently use conservative values
   such as `image/*` and `audio/*`; provider-specific MIME types and wildcard
   support still need review.
2. **Capabilities.** Tool calling, structured output, temperature, attachment,
   streaming, reasoning options, and web-search support are not consistently
   known for every model/provider route. The new fields are present but mostly
   unverified.
3. **Invocation metadata.** `api.formats`, endpoint/location, deployment names,
   wire-level reasoning fields, request overrides, and provider-neutral API
   identifiers need to be populated per route. This is especially important for
   Bedrock, Vertex, Azure, OpenAI-compatible gateways, and regional offers.
4. **Regions.** Provider defaults and route variants are populated, but a
   reusable region registry, region groups, compact availability expressions,
   and provider-specific endpoint/deployment semantics are not yet authored in
   JSON.
5. **Pricing modes.** `service_tiers`, `conditions`, and
   `cache_duration_seconds` exist, but cache write durations, context-threshold
   pricing, media-specific pricing, and mode-specific request requirements need
   source data.
6. **Limits and quotas.** Token limits are partially represented. Provider- and
   tier-specific RPM/TPM/RPD, queue limits, batch limits, and modality-specific
   limits are still empty.
7. **Gateway coverage.** The current local catalogue has 107 provider records
   after adding 14 catalogue-only gateway records. The live models.dev registry
   currently exposes 169 provider IDs, so this is a curated seed, not full
   parity. Important remaining gateway/proxy candidates include Azure Cognitive
   Services variants, Cloudflare Workers AI, GitHub integrations, AI Router,
   LLM Gateway, FastRouter, TrustedRouter, UnoRouter, and other regional or
   plan-specific gateway offers.
8. **Verification.** Existing catalogue facts are marked `unverified` unless
   explicitly reviewed. The importer preserves source and verification metadata
   in the v2 mirror, but no automated freshness/attestation workflow exists yet.

## Decision on models.dev issue #3037

Structurally, the v2 schema covers the major direction of the issue: nested
modalities, reasoning/options, grouped capabilities, explicit open weights,
generic pricing/modes, region-aware routing, lifecycle fields, and sources.
It is not complete parity. The issue itself leaves provider region registries,
availability expressions, pricing/mode naming, media accounting, supported API
identifiers, query semantics, and rate-limit accounting unsettled. Those remain
explicit Phaseo follow-up work rather than being hidden in free-form metadata.

## Next enrichment order

1. Populate first-party route capabilities and API formats from provider docs.
2. Add OpenRouter and gateway model inventories only where they can be joined to
   a canonical model slug; keep those providers `routable: false` initially.
3. Add region groups, endpoint/deployment identifiers, and tier-specific pricing
   conditions.
4. Add rate-limit and modality-limit records.
5. Add verification timestamps and freshness checks to CI/importer validation.
