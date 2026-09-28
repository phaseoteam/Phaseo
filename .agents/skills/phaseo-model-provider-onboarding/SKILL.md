---
name: phaseo-model-provider-onboarding
description: Onboard Phaseo models, provider routes, capabilities, aliases, and pricing directly in the canonical Supabase catalogue. Use for model releases, provider availability, route enablement, pricing, retirement, and catalogue-to-gateway checks. Use a code PR only when application behavior or documentation changes.
---

# Phaseo Model and Provider Onboarding

Use this skill when a change makes a model or provider discoverable,
described, priced, callable, or routable in Phaseo. **The Supabase `v2_*`
catalogue is the source of truth. Use the connected Supabase plugin for
catalogue reads and writes.** Discover its tools if they are not already
loaded. Do not add or edit `packages/data/catalog/src/data` JSON to publish a
model, route, alias, or price. That directory contains archived compatibility
fixtures and has no importer. Do not open a PR for catalogue content alone.

The current main branch's `README.md` and `packages/data/catalog/AGENTS.md`
describe this ownership. If instructions in an older checkout disagree, verify
the current architecture before editing. If the Supabase plugin is unavailable,
ask the user to connect it; never use the old JSON path as a fallback.

## Classify the request

- Catalogue-only: record upstream availability or metadata without making the
  route callable. Upstream catalogues commonly belong here.
- New model on an existing provider: add the canonical model identity,
  provider-model routes, variants, capabilities, applicable pricing, aliases,
  and evidence that existing adapters can execute it.
- New provider or provider variant: add provider identity, credential and
  endpoint metadata, provider-model routes, pricing, and adapter configuration.
  Add code only if the existing gateway primitives cannot implement it.
- New protocol or capability: inspect the public API contract and gateway
  execution path, then ship any required code in a PR. A catalogue row alone
  must not imply executable support.

Never mark a route public or callable merely because an upstream models feed
lists it.

## Inventory before editing

Read the applicable repository and package instructions. Use the Supabase
plugin to list projects, identify the intended Phaseo project, inspect the
relevant `v2_*` tables, and read a comparable live model and provider route.
Do not assume a project ID or copy an archived JSON record. If code changes
are needed, check `git status --short` and preserve unrelated user work.

Check these surfaces as applicable:

- Canonical data: Supabase `v2_models`, `v2_providers`,
  `v2_model_provider_routes`, `v2_route_variants`, `v2_route_capabilities`,
  `v2_pricing_skus`, `v2_pricing_sku_meters`, and `v2_model_aliases` where
  applicable. Inspect related evidence, notices, and effective dates.
- Supabase plugin: use `list_projects` to find the project and `execute_sql`
  for targeted catalogue queries and data changes. Use `apply_migration` for
  schema changes, not a model release. Read Supabase docs through the plugin
  when changing schema or using unfamiliar database features.
- Discovery: scripts/model-discovery/providers/provider-name.ts,
  scripts/model-discovery/providers/discovery-policy.ts, and the discovery
  README and tests.
- Gateway: existing adapter primitives and the provider control plane first;
  inspect `apps/api/src` only when an executor or protocol behavior must change.
- Consumers: apps/web, apps/web-api, apps/docs, OpenAPI sources, generated
  SDKs, provider mocks, and relevant admin or model pages.

## Workflow

1. Establish evidence from official model, availability, and pricing pages or
   endpoints. Record source URLs and access dates. Confirm upstream IDs,
   modalities, limits, regions, cache rates, batch rates, and provider-specific
   billing. Leave unconfirmed facts unset or marked unverified.
2. Read live Supabase rows for the preceding model and target providers.
   Separate canonical model slug, provider route ID, upstream model ID,
   variants, aliases, and display labels. Inspect existing constraints and
   effective dates before writing.
3. Check execution support. Keep upstream availability, Phaseo integration,
   access scope, routing health, and verification state distinct. Reuse a
   compatible configured adapter when it exists. Add gateway code only for
   genuinely new protocol, authentication, or capability mechanics. An upstream
   listing by itself does not make a route callable.
4. Apply the smallest data change through the Supabase plugin, preferably in
   one transaction when related rows must be atomic. Use `execute_sql` for
   targeted DML and `apply_migration` only for DDL. Preserve existing IDs and
   prices unless an intentional change covers every consumer. Never use JSON
   edits, a JSON-import PR, or a data-only migration as the release mechanism.
5. Create model, routes, variants, capabilities, pricing SKUs and meters,
   aliases, and notices only as applicable. Record units precisely (including
   nanos), currency, region, cache duration, service tier, effective window,
   and official source. Check standard, cache, batch, US-only, Bedrock, and
   Vertex prices separately; do not assume partner pricing matches Anthropic.
6. Read back the written rows with the Supabase plugin. Confirm model and
   alias resolution, each route's status and upstream ID, active variants and
   capabilities, SKU/meter prices, and notice state. Check for duplicate or
   overlapping active prices. Test live inference when authorized and possible;
   distinguish configured routing from a successful upstream request.
7. Change repository code or docs only when behavior or copy actually needs a
   deployment. Use the normal branch and PR flow for those changes. Discovery
   code, generated SDKs, and archived JSON are not routine model-release steps.

## Validation

For data-only work, Supabase readback is the primary validation. Query the
exact affected rows and assert provider count, active capabilities, aliases,
pricing meters and units, effective dates, and absence of stale notices. The
archived JSON validators (`pnpm validate:data`, `pnpm validate:pricing`,
`pnpm validate:gateway`, manifest checks) do not prove a live Supabase change.

For code, schema, web, or docs changes, run focused tests and the relevant
repository quality gates. Run OpenAPI generation and SDK tests only when their
contracts change. State whether inference was actually exercised and which
environment was used; do not imply that a configured route passed a live test.

## Completion report

Return a concise report containing:

- classification and the canonical/provider/route IDs;
- Supabase project, tables and rows changed, plus any code/docs files changed;
- evidence sources and any unverified assumptions;
- lifecycle, access, capability, executor, and pricing decisions;
- Supabase readback and any code validation results;
- known limitations, rollout flags, or follow-up work.

Related skills: phaseo-async-webhooks for asynchronous lifecycle behavior and
phaseo-cli for safe discovery and smoke checks.
