# Data Catalog Overrides

These instructions apply to `packages/data/catalog` and extend the repository-level `AGENTS.md`.

## Ownership and Shape

- The database is the canonical source for models, API providers, organisations, benchmarks, pricing, aliases, families, and subscription plans. Use `/internal/data` for changes; the JSON importer is retired.
- `src/data` holds archived compatibility fixtures; `generated/database-v2` holds daily public snapshots and the OpenAPI enum index. Do not use either as a database input feed. Follow the existing JSON/schema shape when maintaining fixtures. Do not add web-only presentation fields or duplicate a fact that already has a canonical owner.
- Keep stable canonical IDs separate from provider route IDs, aliases, display names, and marketing labels. Preserve historical IDs unless an intentional migration updates every consumer.
- Prefer explicit source-backed values over inference. If a fact is unknown, omit it or use the schema-supported unknown state rather than inventing a value.

## Models, Providers, and Pricing

- A model record describes the canonical model; provider files describe callable routes, availability, capabilities, and provider-specific pricing or limits.
- Keep modalities, parameters, context/output limits, lifecycle dates, and provider capabilities internally consistent.
- Pricing units must be explicit and normalized through the established schema. Check input, cached-input, output, image, audio, video, batch, and tiered dimensions independently where applicable.
- When adding or renaming a provider/model, update aliases, logos/references, route mappings, tests, documentation, gateway validation, and generated helper surfaces that consume the ID.
- Do not mark a model callable merely because it exists in a provider catalog; gateway support requires a compatible active route and executor capability.

## Validation and Tests

- Structure validation: `pnpm validate:data`
- Pricing validation: `pnpm validate:pricing`
- Gateway compatibility: `pnpm validate:gateway`
- Focused catalog tests live beside `src/data` and under `src/data/__tests__`.
- Run all three validations for provider, route, capability, pricing, or canonical-ID changes.
- Add deterministic regression coverage for new schema rules, alias resolution, pricing normalization, lifecycle handling, or cross-file invariants.

## Change Safety

- Keep edits targeted to the affected records; avoid bulk formatting or key reordering across unrelated JSON.
- Never overwrite newer or more authoritative provenance with an older secondary source. Record source/provenance fields when the schema supports them.
- Catalog changes can propagate into the web app, gateway, OpenAPI, SDKs, docs, and provider mocks. Regenerate dependent artifacts through root scripts rather than hand-editing generated outputs.
- Add an appropriate changeset when a catalog change alters a published SDK/API surface or other versioned consumer.
