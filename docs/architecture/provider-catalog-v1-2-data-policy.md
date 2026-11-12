# Provider catalog v1.2 data policy proposal

Status: Implementation in progress; migration generation and database replay blocked by missing Docker/Podman. No production changes.

Date: 2026-10-16

Base: `3fce04e875` on `origin/main`

Related: [feature request #2942](https://github.com/phaseoteam/Phaseo/issues/2942), [original report #2933](https://github.com/phaseoteam/Phaseo/issues/2933), [merged fix #2937](https://github.com/phaseoteam/Phaseo/pull/2937).

## Problem and outcome

Providers can publish models, capabilities, prices and service tiers through their catalog feed, but cannot declare the corresponding privacy policy. EmpirioLabs currently needs six manually maintained native text-route guarantees. New native models therefore default to No until reviewed individually.

Add an optional, structured data-policy declaration to catalog v1.2. An approved provider can maintain the declarations for new and existing offers automatically. Phaseo continues to own approval, evidence, effective routing policy and manual overrides. The public model page, provider hover, filters, guardrail previews and gateway must agree on the effective policy.

This proposal scopes a release, not a complete legal-policy language. It covers training, request/response content retention, end-to-end ZDR, evidence and conditions. Residency, security certifications, user-identifier handling, arbitrary policy expressions and automatic legal-document interpretation are outside this release. Operational metadata retention is not implied to be zero by a content-retention declaration.

## Current implementation

- `apps/web-api/src/routes/account/provider-catalog.ts` owns strict validation, normalized model types and the published schemas. Unknown fields are rejected; support must ship before providers add new fields.
- `provider-catalog-tiers.ts` models separate standard, fast, ultrafast, flex and batch offers. Upstream IDs and pricing belong to the tier in v1.1.
- `provider-catalog-overrides.ts` serializes normalized models back to feed documents. Every new field must survive this round trip and tier grouping in `provider-catalog-empiriolabs.ts`.
- `provider-catalog-sync.ts` fetches snapshots; reconciliation stages route candidates; SQL promotion publishes routes/capabilities and pricing.
- Migration `20261015224524_preserve_route_data_policy_on_catalog_sync.sql` preserves admin-owned `metadata.data_policy` and projects it into gateway capability parameters. Writing feed values into that same key would make ownership and revocation ambiguous.
- `apps/api/src/pipeline/before/types.ts` defines policy tiers (`unknown`, `private`, `logs`, `trains`), eligibility (`unknown`, `eligible`, `ineligible`, `conditional`) and retention modes (`unknown`, `none`, `transient`, `fixed`, `until_deleted`). `dataPolicy.ts` resolves effective policy; workspace and capability privacy checks consume it.
- `apps/web/src/lib/providers/dataPolicy.ts` also defines confidence and agreement modes. Confidence is a Phaseo assessment, not a provider input. Agreement modes are `none`, `customer_agreement`, `enterprise_agreement`; a declaration describes a requirement, not proof an agreement is on file.
- The discovery watcher reading the public inference `/v1/models` endpoint is separate from catalog ingestion. Do not make it another writer of routing privacy policy.

The prior Opus review found native flags beyond the six approved chat offers, including other capabilities. Treat those counts as observations from that review, not fixed rollout assertions. Native hosting alone is not a general privacy guarantee.

## Proposed wire contract

Use `schema_version: "1.2"`, retaining the v1.1 tier structure. Add `data_policy` only to `service_tiers[]`. It contains capability-scoped declarations; no model-wide inheritance and no provider-wide feed default in this release. This prevents standard-offer policy accidentally applying to a different upstream tier or to persistent operations on the same model.

Proposed complete example; meter names must also pass the live meter-definition validator:

```json
{
  "schema_version": "1.2",
  "data": [{
    "id": "qwen/qwen3.8-27b",
    "capabilities": [{ "id": "responses", "parameters": ["temperature"] }],
    "service_tiers": [{
      "service_tier": "standard",
      "provider_model_slug": "qwen3-8-27b",
      "pricing": [{
        "meter_key": "input_tokens",
        "modality": "text",
        "direction": "input",
        "unit": "token",
        "unit_quantity": 1000000,
        "price_nanos": 250000000,
        "display_label": "Input",
        "display_unit": "1M tokens"
      }, {
        "meter_key": "output_tokens",
        "modality": "text",
        "direction": "output",
        "unit": "token",
        "unit_quantity": 1000000,
        "price_nanos": 750000000,
        "display_label": "Output",
        "display_unit": "1M tokens"
      }],
      "data_policy": {
        "capabilities": [{
          "id": "text.generate",
          "training_policy": "no_train",
          "retention_mode": "none",
          "retention_days": 0,
          "zero_data_retention": true,
          "zdr_eligibility": "eligible",
          "requirements": {
            "contract_mode": "none",
            "account_settings": []
          },
          "privacy_policy_url": "https://empiriolabs.ai/privacy-policy",
          "terms_of_service_url": "https://empiriolabs.ai/terms-of-service",
          "notes": "No request or response content retained after delivery."
        }]
      }
    }]
  }]
}
```

Prices are illustrative, not EmpirioLabs pricing. This proposal does not publish the schema or validate the example against a v1.2 parser, which does not exist yet.

| Field | Proposed meaning and validation |
| --- | --- |
| `id` | A unique canonical capability declared by the model. Canonicalize protocol aliases before matching; reject conflicting duplicate policies. |
| `training_policy` | Reuse `unknown`, `may_train`, `no_train`, `opt_out_available`, `enterprise_no_train` from `promptTrainingPolicy.ts`. In v1.2, define the declaration as covering both prompts and outputs, including subprocessors. Unknown is not no-training; conditional values require fulfilment evidence. |
| `retention_mode` | Existing enum: unknown, none, transient, fixed, until_deleted. Covers request and response content across the upstream chain. |
| `retention_days` | Non-negative finite number or null. Fixed requires a positive upper bound; none requires 0; unknown/until_deleted require null. Define transient duration precisely before implementation. |
| `zero_data_retention` | Boolean or null. True declares an active end-to-end guarantee for this offer as served to Phaseo, not merely availability of an optional ZDR programme. |
| `zdr_eligibility` | Existing enum. Conditional describes a possible configuration and never grants active ZDR. Explicit ineligible always denies. Validate consistency with the boolean. |
| `requirements.contract_mode` | Existing agreement enum describes what must be agreed. Phaseo independently records fulfilment for the relevant account/credential context. |
| `requirements.account_settings` | Bounded list of required provider settings, each with stable `id`, human-readable `description` and HTTPS `documentation_url`. These are declarations, not arbitrary executable predicates. |
| Policy/terms URLs | HTTPS public evidence links, validated with existing URL safeguards. Store references; do not fetch arbitrary URLs during sync. Require policy evidence before granting a positive policy. |
| `notes` | Optional bounded explanatory text; never executable and never sufficient to grant a guarantee. |

Reject unknown nested fields and wrong types. Do not accept provider-supplied `verified`, `confidence`, approval timestamps or Phaseo actor IDs. Derive the display tier from the approved facts instead of accepting contradictory `private`/`logs`/`trains` labels. Training and retention must remain independently representable; no-training does not imply ZDR.

For a positive ZDR declaration, require no training, no content retained after delivery, eligible status, evidence and no outstanding conditions. Inconsistent declarations fail validation with a field path. Conditional policies remain visible in preview but inactive until Phaseo can establish the required configuration. If account-specific conditions cannot be checked for BYOK, do not grant that route a universal guarantee.

## Approval, ownership and effective policy

Store the latest declaration separately from its approval and from manual policy pins. Use the existing capability policy shape for the effective projection, but do not give providers write access to that projection.

Suggested ownership:

- Catalog snapshot/candidate: normalized submitted declaration and source run/hash.
- Capability metadata `catalog_data_policy`: catalog-owned accepted facts and provenance, replaced on each applicable snapshot.
- Capability metadata `data_policy`: existing Phaseo-owned manual override, preserved by sync.
- Admin-only approval record: provider/source identity, approved policy semantics and capability/tier scope, evidence URL, actor, timestamp and approval revision. Approval of a provider account or model is not automatically approval of privacy claims.

Approve the declaration mechanism once for a defined scope so new matching offers can be covered automatically. A materially changed claim or new condition outside that scope remains unapproved. The provider may not expand its approval scope in a feed.

Effective-policy order:

1. Enforce operation safety restrictions: batch-tier execution, batch capabilities and persistent files/stateful operations cannot acquire ZDR from this feed feature.
2. Apply an explicit Phaseo manual policy where present. Preserve deny overrides. Any exceptional override of an operation restriction needs a separate reviewed mechanism, outside v1.2.
3. Otherwise apply a current, approved catalog declaration whose conditions are satisfied for the execution context.
4. For a v1.2 declaration that is missing, withdrawn, unknown or unapproved, emit an explicit non-granting result. Do not silently inherit a provider-wide Yes over a withdrawn offer declaration.
5. Legacy routes without v1.2 policy management retain their existing provider defaults and manual policies. Migration into v1.2 policy management is explicit and recorded.

Within a declaration, false/ineligible denies. A feed withdrawal of an otherwise manually pinned Yes creates an admin conflict requiring review; the pin remains explicitly owned by Phaseo rather than being silently overwritten. Include a clear conflict alert. The EmpirioLabs rollout removes the six pins only after proving their feed replacements work, enabling subsequent automatic revocation.

## Snapshot, withdrawal and freshness rules

| Input/event | Required outcome |
| --- | --- |
| Approved true, new eligible offer | Publish catalog-managed effective guarantee within approved scope. |
| Explicit false/ineligible | Withdraw previous catalog guarantee immediately on accepted snapshot. Do not claim a known retention duration from false alone. |
| Missing `data_policy`, null policy, missing capability entry | For an already v1.2-managed offer, withdraw that catalog guarantee; missing is not a patch preserving the old value. Null means explicit withdrawal, not provider-default inheritance. |
| Unknown field value | Preserve unknown as unknown; it cannot grant privacy-restricted routing. |
| Valid conditional declaration | Display requirements; remain non-granting unless fulfilment is independently established. |
| Downgrade to v1.0/v1.1 | Preserve legacy parsing support, but withdraw catalog-managed privacy grants for this source. A version downgrade cannot preserve obsolete v1.2 guarantees. |
| Offer removed | Retire the feed-managed offer through the existing lifecycle, preserving history. |
| Invalid document/fetch failure | Keep last accepted declaration as historical evidence; do not treat failure as an authoritative false. Enforce its independently stored expiry. Notify operators. |
| Trust revoked/source replaced | Invalidate catalog guarantees and refresh runtime/public projections without requiring another successful upstream fetch. |

Recommended starting freshness rule: catalog-managed positive guarantees expire 24 hours after the last successful validation of the same source and approval revision; a valid HTTP 304 refreshes freshness. Persist expiry in snapshots and enforce it at read/request time, not solely in a scheduled job. The 24-hour value is a proposed product decision, not an existing policy. Expiry prevents a stalled sync from leaving an indefinite guarantee. Unknown/expired public state must not render as an actively verified Yes.

Refresh gateway snapshots and public model/pricing/notice/search/guardrail caches after policy publication or revocation. Cache lifetimes may not extend a guarantee beyond expiry. Reuse existing cache scopes and invalidation paths rather than introducing a second publication channel. Define a measured propagation bound before release; the proposed acceptance target is at most five minutes for explicit revocations, with request-time expiry exact to the stored deadline.

Record before/after declaration, effective-policy change, source run/hash, approval revision, actor when applicable and reason for denial/withdrawal. Repeated identical snapshots should not create artificial policy-change history, though freshness may advance.

## Acceptance criteria

- v1.0/v1.1 feeds remain valid and keep existing behaviour unless explicitly migrated from v1.2 management.
- v1.2 fields survive parser, normalization, tier grouping, draft serialization, snapshot, candidate and promotion without silent loss.
- No provider can self-verify or mutate an admin pin/approval through feed, draft editor or webhook.
- Approved new EmpirioLabs native text offers can become ZDR automatically; other offers do not acquire a guarantee.
- True to false, omitted entry, null, version downgrade, source replacement, expiry and trust revocation all withdraw catalog-managed grants correctly.
- Standard/fast policies cannot leak into batch or other capabilities, and conditional/BYOK policies cannot become unconditional.
- Web displays, filters, guardrail preview and actual gateway selection resolve the same effective policy and provenance.
- Existing six manual guarantees remain intact throughout staged rollout; feed ownership transfer is explicit and reversible.

## Implementation slices

1. **Contract and fixtures:** settle open semantics; add v1.2 schema dispatch, typed policy declarations, strict validation, complete examples and published schema/docs. Keep older schemas supported. Store declarations as unapproved; do not alter routing yet.
2. **Durable ownership and approval:** read `supabase/AGENTS.md` and `DECLARATIVE-SCHEMAS.md`; edit desired definitions in `supabase/schemas`, generate/review a forward migration, update candidate/snapshot/promotion functions and audit records. Add admin-only approval and conflict/revocation actions using existing authorization.
3. **Effective projection:** resolve admin/catalog/legacy policies consistently, enforce tier/capability/conditions/expiry, and project the same result to gateway and public APIs. Add a bounded cache invalidation path for changes including trust revocation.
4. **Operator and provider experience:** preview declared versus effective policy, reasons for pending/expired/conditional states, evidence and manual conflicts. Providers can edit declarations in managed drafts without gaining approval permissions. Update draft diff/export/import and round-trip handling.
5. **EmpirioLabs adoption:** confirm remote versus managed source mode and exact live IDs; approve narrowly scoped evidence; coordinate their explicit v1.2 feed update; compare six current guarantees and third-party controls; transfer manual pins atomically only after comparison succeeds.

Primary impact: `apps/web-api/src/routes/account/provider-catalog*.ts`, catalog review routes, scheduled sync, declarative catalog SQL/promotion, gateway snapshot RPCs and policy resolvers, web pricing/guardrail resolvers, provider onboarding/editor UI, `apps/web-api/docs/provider-catalog-v1.md`, `apps/docs/v1/guides/provider-catalog.mdx`, schema endpoint and `apps/api/docs/v2-data-model.md`. Verify the actual function owners before editing. No inference protocol or billing change is intended; regenerate SDKs only if their source OpenAPI contract changes.

## Verification and rollout proof

- Parser tests: valid/invalid policy fields, bounded URLs/notes/requirements, duplicate aliases, contradictions, null/missing, tier and capability isolation, batch rejection, older-version compatibility and full round trips.
- SQL integration tests: unapproved versus approved, grants/revocations, source changes/downgrades, manual pins both directions, conflicts, idempotency and tenant/admin permissions; use `supabase/tests/provider_catalog_retention.sql` as the existing baseline.
- Gateway/web tests: same fixtures produce identical effective policy, including batch-tier text.generate, persistent files, unmet agreements/settings, BYOK, expired snapshots and provider-wide Yes fallback hazards.
- Clock/cache tests: HTTP 304 freshness, outage expiry, immediate trust withdrawal, stale cached positive policy and measured propagation bound.
- Schema checks: `pnpm db:schema:check`, relevant SQL tests and disposable replay/incremental smoke through the repository tooling. Report unavailable Docker/runtime checks explicitly.
- Build proof: focused web API/gateway/web tests, lint/type checks and relevant builds. Public-doc changes need link checks and rendered-page evidence. A scope document alone does not require these runtime checks.
- Roll out parser/storage before providers publish new keys, then approvals/effective projection behind a controlled enablement. Verify preview/staging and production readback when deployment is authorized. Keep history and rollback approval available; rollback must not restore revoked guarantees or require reverting immutable migrations.

## Decisions to settle before implementation

1. Approve the proposed 24-hour freshness window and five-minute revocation propagation target, or choose explicit alternatives.
2. Define transient retention precisely and whether prompt/output policies need separate fields in this release. Recommended initial rule: one declaration must cover both; providers with differences report the more restrictive combined outcome and explain it in notes.
3. Define how Phaseo records account-setting/agreement fulfilment for managed credentials and BYOK. Until supported, conditional claims remain informational and non-granting.
4. Confirm whether approvals follow a bounded provider/source policy or require review for each materially changed declaration; recommend scoped provider/source approval plus mandatory review for expansions.
5. Confirm that reusing the prompt-training enum for combined prompt/output declarations is acceptable, and decide whether the public name should be `training_policy`. Do not expose internal display tiers as provider assertions.
6. Confirm EmpirioLabs feed mode, capability/tier inventory and evidence. This scope did not query production or independently recheck the prior Opus feed counts.

## Original scope validation

Prepared by inspecting the clean worktree at the base above, current feed schema/parser/tier and override modules, gateway effective policy types/resolver and existing provider policy types. This is a proposal; the JSON fragment is illustrative. No dependencies installed, runtime tests run, schema generated, production modified, commit created or external response posted for this scoping task.

Implementation started after the scope was accepted. See [implementation verification](provider-catalog-v1-2-verification.md) for current results and the remaining release gate. Conditional claims are stored but remain inactive; active ZDR support is initially limited to unconditional text generation. The approval API is implemented; a dedicated approval console is not part of this initial slice.
