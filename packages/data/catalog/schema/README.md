# Catalogue JSON schema

[`catalog.schema.json`](./catalog.schema.json) documents the structural
contract shared by model, organisation, provider, provider-model, pricing,
alias, benchmark, family, and subscription-plan files.

The existing TypeScript validator remains authoritative for cross-file rules:
foreign-key-like references, duplicate slugs, provider/model consistency,
pricing coverage, and importer-specific normalisation. The JSON Schema is the
fast structural contract for editors, pull requests, and external tooling.

Unknown properties are allowed deliberately. Provider metadata evolves faster
than the core catalogue, so new fields should be added to the schema when they
become part of the stable contract without blocking forward-compatible imports.

## v2 authoring fields

Every model file carries the v2 fields `model_type`, `knowledge_cutoff`,
`limits`, `modalities`, `reasoning`, `capabilities`, `open_weights`, `sources`,
`license_url`, and `verification`. Unknown values are represented explicitly as `null`; an
empty array means the category is known but has no entries yet.

Provider files additionally carry `gateway_kind`, `routable`,
`routing_enabled`, SDK/API metadata, `api_formats`, `service_tiers`, sources,
and verification. Provider-model entries carry route status, execution/data
regions, service tiers, API invocation metadata, and capability evidence.

Pricing rules have explicit `region`, `cache_duration_seconds`, `conditions`,
and `source` fields. This lets cache-duration pricing, regional pricing, and
selectable modes be represented without inventing new columns or relying on
opaque free-form keys.
