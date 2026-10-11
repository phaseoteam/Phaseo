---
name: phaseo-internal-model-onboarding
description: Configure Phaseo models for internal-only administrator viewing and testing through Supabase, verify private request history, and check public exclusion. Use for staged or permanently internal models; publication is a separate action.
---

# Phaseo Internal Model Onboarding

Configure administrator viewing and testing while excluding ordinary-user
discovery, execution, and public reporting. Use
[phaseo-model-provider-onboarding](../phaseo-model-provider-onboarding/SKILL.md)
for provider evidence, pricing units, adapters, and catalogue ownership.
Supabase is canonical; archived catalogue JSON is not an onboarding feed.
Data-only setup uses targeted Supabase DML. Behavior changes use code PRs.

## Establish scope

Identify the canonical slug, upstream ID, provider, endpoints, intended
Supabase project, and whether the model is staged or permanently internal.
Record an explicit permanent restriction in maintained internal operator
documentation or a supported catalogue policy field. Do not invent a database
field or assume `hidden` prevents a privileged operator from publishing later.

Internal onboarding does not authorize public release, announcement, or paid
inference by itself. Follow existing session authorization without repeatedly
asking for permission. Keep confidential identifiers and upstream details out
of public PRs, issues, fixtures, docs, changelogs, and screenshots. Generic
code fixes should use synthetic examples.

## Inventory the live controls

Discover the Supabase plugin and identify the project rather than hardcoding
its ID. Inspect live constraints, RLS, triggers, and a comparable internal
route. Inventory all target routes, aliases, variants, capabilities, SKUs,
meters, effective windows, and any existing public configuration.

### Required automation gate before any write

Inspect `v2_models.metadata.provider_catalog_owner`, `released_at`, active
`provider_catalog_sources`, and the deployed `apply_provider_catalog_snapshot`
and `promote_provider_catalog_candidate` functions. The current promotion
guard allows a hidden, unreleased model owned by the submitting provider to
be promoted, enabling public routes and clearing `hidden` during a poll.
`v2_catalogue_source_overrides` alone does not protect those visibility fields.

For this workflow, create administrator-managed models without
`provider_catalog_owner`. Do not adopt a provider-owned, unreleased model into
internal testing unless a deployed, verified exclusion prevents every relevant
sync/promotion path from publishing it. If that protection is absent, stop
before onboarding that model and report the blocker; do not claim it is safe.
Do not silently erase existing ownership, falsify `released_at`, or disable an
entire provider's polling. Adding a durable policy/promotion guard requires
separately scoped code/schema work and validation. An internal policy note is
operator guidance, not an automation guard. Recheck this gate after any change
in catalogue ownership or sync configuration.

Verify current deployed behavior at these implementation anchors:

- Admin source and chat: `apps/web/src/lib/fetchers/internal/fetchAdminModelSource.ts`
  and `apps/web/src/lib/chat/adminInternalModels.ts`.
- Gateway authorization/context: `apps/api/src/pipeline/before/`; search for
  `internalOnly`, `billableInternalTesting`, and administrator checks.
- Pricing: `apps/api/src/pipeline/pricing/` and candidate `accessScope` in
  execution. Pricing scope follows the selected route, including fallbacks.
- Audit: `apps/api/src/pipeline/after/audit.ts` and
  `apps/api/src/pipeline/audit/index.ts`.
- Reporting: `supabase/schemas/public/functions/public_reporting_route_is_visible.sql`
  and `supabase/schemas/private/functions/set_request_public_reporting_scope.sql`.

Inspect privileged testing-token access separately. Such credentials can be
another internal access mechanism; do not claim literally only administrators
can execute if that mechanism is enabled. Never give these credentials to
ordinary users.

## Apply internal configuration

Use a targeted transaction for related records, based on the live schema.
Keep lifecycle, upstream availability, Phaseo integration, access scope, and
routing enablement distinct.

| Control | Internal-only value |
| --- | --- |
| `v2_models.hidden` | `true` |
| Model lifecycle | Supported state; not disabled/retired for admin chat |
| All target routes' `access_scope` | `internal` |
| Route `phaseo_status` | `testing`; admin eligibility also supports `enabled` |
| Route `routing_enabled` | `false` |
| Route `status` | Supported active state; current admin chat expects `active` |
| Provider availability | Actual upstream state |
| Capability | Supported endpoint and active/internal-testing capability |
| Pricing | Applicable active SKU/meters with verified units and rates |
| Effective windows | Valid for intended test time |

The internal context can execute eligible internal routes without enabling
public routing. Never flip scope or public routing to repair an admin pricing
or eligibility error. `is_stealth` is a separate policy, not a substitute for
hidden/internal: stealth redaction can prevent an admin chat provider lock.

Admin chat currently adapts `text.generate`. Other supported gateway endpoints
do not automatically gain chat UI support. Verify adapter support, credentials,
capabilities, and pricing; do not invent rates or upstream functionality.

Read back every affected record and alternative identifier. Confirm no public
route remains, aliases do not expose another public identity, and discovery or
sync cannot unintentionally publish the model. Use existing catalogue cache
invalidation; distinguish written configuration from propagated/deployed state.

## Verify administrator testing and private logs

When live inference is authorized and credentials are available, make a small
admin request and trace its request ID through private request facts and the
gateway audit pipeline. Verify the
selected route, upstream ID, pricing/billing, result, and private workspace
request history. Inspect failure auditing when a failure occurs; do not incur
extra paid requests just to complete a checklist.

Billable internal admin requests must persist private audit records despite
`testingMode = true`. Their durable facts must retain
`safe_metadata.testing_mode = true` and `public_reporting_allowed = false`.
Previously excluded facts remain excluded on update. Never clear these markers
or publish/backfill test traffic to fix missing private logs. Older skipped
requests may not be recoverable; report the evidence and limitations.

## Check public exclusion

Test anonymously and, when available, as a signed-in non-admin/API-key owner.
Check canonical IDs, aliases, and variants across:

- Model lists/table, organisation/provider pages, global search, chat and
  compare pickers, updates, and sitemap.
- Public catalogue/detail APIs, gateway model listing, and explicit non-admin
  inference. A hidden listing alone does not prove execution is denied.
- Header, pricing, availability, provider metadata, benchmarks, usage,
  performance, applications, timeline, and subscriptions.
- Direct pages and OG/Twitter metadata/image routes using a social-crawler
  user agent. Hidden/nonexistent pages should have generic unavailable
  metadata without social images, retain Browse models, and image endpoints
  must not render internal data.
- Client-supplied `includeHidden=true` and similar flags: no access escalation.
- `public_reporting_route_is_visible` returns false for each route; private
  facts remain excluded and public reporting, usage, pricing, and rankings
  contain no target traffic.

Compare guessed URLs with a synthetic nonexistent model. An echoed supplied
ID is not proof of database disclosure; actual names, descriptions, prices,
providers, metrics, or existence-dependent responses require investigation.
503s and unavailable non-admin credentials are untested checks, not passes.

## Deliberate release, only when separately authorized

Onboarding never authorizes publication. A permanent-internal restriction
prohibits release unless the user explicitly revises that restriction.

Recheck support, pricing, dates, lifecycle, aliases, and notices. Use the
existing administrator availability action: authenticated
`PUT /api/account/models/:modelId/availability` with `{ "available": true }`,
implemented in `apps/web-api/src/routes/account/models.ts`. It invokes
`set_v2_admin_model_availability` with the authenticated administrator's ID and
purges the catalogue cache. Do not reproduce publication with direct DML or
bypass the action's validation when it rejects a release.

The RPC validates prepared routes and atomically coordinates public scope,
enabled routing, active capabilities, model lifecycle/catalogue status,
release timestamp, admin audit history, and database-managed source override.
Check `supabase/schemas/public/functions/set_v2_admin_model_availability.sql`
for the current readiness contract. The application's availability action is
a publication operation, unlike upstream provider availability metadata alone.
Verify ordinary-user discovery and execution after propagation. Source
overrides do not replace the automation gate above.

Preserve earlier internal facts and exclusions. New public traffic can enter
reporting; historical internal tests stay private.

## Completion evidence

Report affected project/IDs, staged or permanent policy, configuration,
supported testing surface, pricing, whether inference actually ran, private
log evidence, public checks, and remaining untested surfaces. Separate
configured, deployed, propagated, and observed results. Do not claim universal
safety for untested endpoints or future code, or publish confidential details
outside the authorized internal context.
