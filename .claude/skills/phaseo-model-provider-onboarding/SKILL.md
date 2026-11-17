---
name: phaseo-model-provider-onboarding
description: Required for every new model added to Phaseo, including a lab's new release (e.g. a new GPT, Claude or Gemini model), a new provider route for an existing model, and any "add this model to Supabase" request. Covers model rows, provider routes, variants, capabilities, pricing, plans, aliases, benchmarks, and checks that the model appears in /models, Chat and the gateway. Also use for provider availability, route enablement, price changes and retirement. Works directly in the canonical Supabase catalogue; use a code PR only when application behavior or documentation changes.
---

# Phaseo Model and Provider Onboarding

**Use this skill for every new model addition, however small.** Copying a
sibling model's rows by hand is the most common way to miss a table: a model
can show on /models while Chat and the gateway cannot use it.

Use this skill when a change makes a model or provider discoverable,
described, priced, callable, or routable in Phaseo. **The Supabase `v2_*`
catalogue is the source of truth. Use the connected Supabase plugin for
catalogue reads and writes.** Discover its tools if they are not already
loaded. The repository holds no catalogue JSON; do not add any to publish a
model, route, alias, or price. Do not open a PR for catalogue content alone.

The current main branch's `README.md` and `AGENTS.md`
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
  `v2_pricing_skus`, `v2_pricing_sku_meters`, `v2_model_aliases`,
  `v2_subscription_plan_models`, and `v2_benchmark_results` where
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
   For a new model, work through the checklist below before reporting done.
6. Read back the written rows with the Supabase plugin. Confirm model and
   alias resolution, each route's status and upstream ID, active variants and
   capabilities, SKU/meter prices, and notice state. Check for duplicate or
   overlapping active prices. Test live inference when authorized and possible;
   distinguish configured routing from a successful upstream request.
7. Change repository code or docs only when behavior or copy actually needs a
   deployment. Use the normal branch and PR flow for those changes. Discovery
   code, generated SDKs, and archived JSON are not routine model-release steps.

## New model checklist

Compare every table below against the nearest live sibling model, such as
the previous version from the same lab. Query each table for both models side
by side; a table where the sibling has rows and the new model has none is a
gap, not a choice, unless you can say why.

1. `v2_models`: identity, family, `previous_model_slug`, modalities, limits,
   knowledge cutoff, reasoning options, release date and sources.
   `mutate_v2_admin_model_graph` only updates existing models, so insert the
   row first.
2. `v2_model_provider_routes`: one row per provider, with upstream ID,
   status, `routing_enabled`, context and output limits.
3. `v2_route_variants`: one per service tier the provider documents. Do not
   copy tiers the new model lacks (for example, Ultrafast).
4. `v2_route_capabilities`: **required for Chat and the gateway.** A route
   with no `text.generate` (or the matching capability for other modalities)
   still appears on /models but is missing from the Chat picker and the
   gateway's capability list. Set the capability's params (reasoning values,
   endpoints, tool notes) and token limits from the new model's docs; do not
   copy the sibling's values blindly.
5. Pricing: save each SKU through `mutate_v2_admin_pricing_sku` (versioned
   and audited), then link SKUs to their variants with a targeted `UPDATE`
   scoped to the new route. `refresh_v2_pricing_variant_links()` relinks every
   SKU across the whole catalogue whose `route_variant_id` is `NULL` or
   differs from the matching `global:` variant, so it can also overwrite
   existing links, including regional ones. Call it only when you intend to
   rewrite those links, and report how many rows it changed and which of them
   already had a link (`v2_catalogue_row_history` records the before state).
6. `v2_subscription_plan_models`: add the consumer plans the lab's
   announcement names (e.g. ChatGPT Plus/Pro, Claude Pro/Max). Leave out plans
   the announcement does not name.
7. `v2_model_aliases`: **check on every launch.** Aliases point at the
   *older* model, so comparing the two models' rows side by side never shows
   a gap here. Skipping this step left `openai/gpt-terra-latest` on GPT-5.6
   Terra for three weeks after GPT-6.1 Terra launched.
   - **Find the aliases.** List enabled aliases on any model the new one
     replaces, walking `previous_model_slug` back from the new model:

     ```sql
     with recursive line as (
       select previous_model_slug as slug, 1 as depth
       from v2_models where model_slug = '<new-model>'
       union all
       select m.previous_model_slug, l.depth + 1
       from line l join v2_models m on m.model_slug = l.slug
       where l.depth < 6 and m.previous_model_slug is not null
     )
     select a.alias_slug, a.model_slug, a.alias_type
     from v2_model_aliases a join line l on l.slug = a.model_slug
     where a.enabled;
     ```

     Also search by name (for example `alias_slug ilike '%terra%'`), because
     the `previous_model_slug` link can be missing or skip a tier.
   - **Move each rolling `-latest` alias as part of the launch.** A rolling
     `-latest` alias has a slug that ends in `-latest` and names no version
     or date, and an `alias_type` of `stable`, `preview` or `public`.
     `public` is the default type for aliases made through the admin UI,
     `mutate_v2_admin_model_aliases` and the account API, so most rolling
     aliases have it. A rolling alias must point at the newest public model
     in its line. Once the new model is public,
     move the alias in the same session as the launch, without waiting to be
     asked. The new model counts as public when `status = 'active'`,
     `hidden = false`, `catalogue_status = 'available'`, and at least one
     route has `status = 'active'` and `routing_enabled = true`. Move it
     after the visibility check in step 10.
   - **Ask the user first, instead of moving, when:**
     - the new model is preview, limited access, hidden, or not yet
       routable. For a staged hidden model, move the alias when the model is
       flipped live, not when it is staged;
     - its standard input or output price is more than 2× the old target's;
     - it drops an input or output modality, or a capability, that the old
       target had;
     - it is a different tier rather than the next version of the same one,
       for example a Pro model replacing a non-Pro model, or a Flash alias
       whose `previous_model_slug` chain leads to a renamed line.

     Moving an alias reroutes live traffic for every caller that uses it, so
     state the old and new targets when you ask.
   - **Never move pinned aliases.** Dated, versioned, legacy and provider
     aliases keep their target: `alias_type` `version`, `legacy`, `provider`
     or `v2-canonical`, and any slug that names a version or date, even if it
     ends in `-latest` (for example `openai/gpt-5.2-chat-latest` or
     `qwen/qwen3.8-max-2026-09-02`).
   - **No `-latest` alias for the line yet:** add one if the lab publishes
     that alias name. Otherwise, ask the user.
   - **Move with a guarded update** that matches the old target, so a rerun
     or a concurrent change does nothing:

     ```sql
     update v2_model_aliases
     set model_slug = '<new-model>', updated_at = now()
     where alias_slug = '<alias>' and model_slug = '<old-model>'
       and enabled
     returning alias_slug, model_slug;
     ```

     If no row comes back, the alias changed after you read it. Re-read it
     before trying again.
   - **Report it.** In the completion report, list every alias you moved,
     left in place, or asked about, with the reason for each.
8. `v2_model_links`: one row per link the model page should show, such as
   the announcement, model card, paper, each weights repo (one row per
   checkpoint, for example NVFP4 and MXFP8) and the main provider pages.
   `title` is the label people see, so write it as it should read ("Inkling-2-Small
   on Hugging Face"). `link_kind` must be one of the fixed kinds in the
   `v2_model_links_link_kind_check` constraint; it picks the fallback icon and
   the comparison columns (`weights` for Hugging Face repos, not `model`).
   `sort_order` sets the display order, lowest first, in steps of 10.
9. Benchmarks in `v2_benchmark_results`:
   - Lab-reported scores from the launch post and system card. Reuse existing
     `v2_benchmarks` IDs so the model is comparable with other labs, and add a
     new benchmark row only for a genuinely new benchmark or version. Store
     one row per reasoning effort with `variant` set to the effort; the web
     ranks each model by its best score. Put the setting, cost and source in
     `other_info`, and set `is_self_reported=false` for competitor scores a
     lab reports about another lab's model.
   - Artificial Analysis: set `metadata.external_ids.artificial_analysis` to
     the model's AA configuration ID once AA lists it. The sync's name matcher
     can miss new models; with the ID set, the sync keeps every reasoning
     configuration. Dispatch `artificial-analysis-sync.yml` and read back the
     `aa-*` rows.
   - Launch charts on lab sites are often embedded Vega-Lite data. Extract
     the exact values rather than reading numbers off images.
10. Visibility check: confirm the model in the gateway model list (for
   example `phaseo api get models --json` shows the expected capabilities and
   endpoints) and that it is selectable in Chat, not only listed on /models.
11. Changelog: once the model has a live route, add it to the Models section
    of the docs changelog, in all 9 languages, following `phaseo-changelog`.
    Date it by the release date, or for a catalogue-only model, by the date
    its route went live. The entry is the model link only, with no price,
    limits or lineage.
    Deprecations and retirements never get a changelog entry.

## Deprecating or retiring a model

Before you set a model to `deprecated` or `retired`, or disable its last
live route, list the enabled aliases that still point at it:

```sql
select alias_slug, alias_type from v2_model_aliases
where model_slug = '<model>' and enabled;
```

Use the definitions in checklist item 7 to sort these into rolling and
pinned aliases. A slug that ends in `-latest` but names a version, such as
`openai/gpt-5.2-chat-latest`, is pinned.

- **Rolling `-latest` aliases:** move each one to the newest public model in
  its line, or to the model's `replacement_model_slug`, using the guarded
  update in checklist item 7. Confirm the target first: it must have an
  active, routing-enabled route. If no served target exists, ask the user
  whether to disable the alias.
- **Pinned aliases:** leave them on the model, because callers chose that
  version. Once the model is unserved, requests through a pinned alias fail
  unless the gateway's successor redirect applies. That only happens when the
  caller's workspace has turned redirect on (it is off by default), the
  replacement is approved, the 72-hour grace period has passed, and the
  workspace's price policy allows the replacement. List every pinned alias
  left on an unserved model in the completion report, so the user can decide
  whether to disable it.
- **Never leave an enabled rolling alias on a model with no live route.**
  Callers get an error instead of the current model. A deprecated model that
  is still served can keep its rolling alias until it stops being served, but
  tell the user the alias is there.

## Validation

For data-only work, Supabase readback is the primary validation. Query the
exact affected rows and assert provider count, active capabilities, aliases,
pricing meters and units, effective dates, and absence of stale notices.

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
- aliases moved (old → new target), left in place, or waiting on the user,
  with the reason for each;
- Supabase readback and any code validation results;
- known limitations, rollout flags, or follow-up work.

Related skills: phaseo-async-webhooks for asynchronous lifecycle behavior and
phaseo-cli for safe discovery and smoke checks.
