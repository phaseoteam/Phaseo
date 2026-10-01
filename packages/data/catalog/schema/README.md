# Archived catalog fixture schema

[`catalog.schema.json`](./catalog.schema.json) documents the structural
contract for archived model, organisation, provider, provider-model, pricing,
alias, benchmark, family, and subscription-plan files.

The existing TypeScript validator remains authoritative for cross-file rules:
foreign-key-like references, duplicate slugs, provider/model consistency,
pricing coverage, and fixture normalisation. This schema describes compatibility
fixtures, not the live database editor. Report catalog corrections through
[GitHub issues](https://github.com/phaseoteam/Phaseo/issues/new/choose); maintainers
update the database. The legacy JSON importer is retired.

Unknown properties are allowed deliberately. Provider metadata evolves faster
than the core catalogue, so new fields should be added to the schema when they
become part of the stable contract without blocking forward-compatible fixture tooling.

## Archived v2 fields

Every model file carries the v2 fields `model_type`, `knowledge_cutoff`,
`limits`, `modalities`, `reasoning`, `capabilities`, `open_weights`, `sources`,
`license_url`, and `verification`. Unknown values are represented explicitly as `null`; an
empty array means the category is known but has no entries yet.

Free API models may be standalone model records with a `:free` model ID and
`variant_kind: "free"`. `base_model_id` is optional. When a real standard
sibling exists, a free offer may instead use that model's `variants` array.
Provider-model rows reference the exact free identity with
`canonical_model_id`; preserve these historical identities in compatibility fixtures.

Provider files additionally carry `gateway_kind`, `routable`,
`routing_enabled`, SDK/API metadata, `api_formats`, `service_tiers`, sources,
and verification. Provider-model entries carry `provider_status` for upstream
offer availability, `phaseo_status` for Phaseo integration readiness,
`access_scope` for public versus internal-only use, and a separate
`routing_status` for routing health, plus execution/data regions,
service tiers, API invocation metadata, and capability evidence. The optional
provider or route-level `availability` policy uses ISO country and subdivision
codes with request-origin geolocation; provider-family defaults are inherited
unless a route overrides them. It is deliberately separate from execution and data residency.
Only
`phaseo_status: "enabled"` can become publicly routable. See
[`apps/api/docs/catalogue-status-model.md`](../../../../apps/api/docs/catalogue-status-model.md)
for the canonical vocabularies and compatibility mappings.

Pricing rules have explicit `region`, `cache_duration_seconds`, `conditions`,
and `source` fields. This lets cache-duration pricing, regional pricing, and
selectable modes be represented without inventing new columns or relying on
opaque free-form keys.
