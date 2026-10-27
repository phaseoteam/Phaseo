# Provider catalog v1.2: data policy

Implementation preview. Deployment requires the accompanying database migration and replay checks; do not publish v1.2 feed fields before parser support is deployed.

Version 1.2 retains v1.1 service tiers and pricing. Set `schema_version` to `"1.2"` and add optional `data_policy` to individual `service_tiers` entries. Optional `declarations` on a model or tier describe typed media capabilities, parameters, scoped pricing/capacity, identity and deployment details for review. See [field coverage](provider-catalog-fields.md) for what is stored versus applied. Retrieve the schema at `/api/internal/provider-catalog/schema?version=1.2`.

Each declaration applies to one canonical capability on that upstream offer. It covers prompts and outputs across your entire upstream processing chain. Declare the most restrictive combined policy when they differ. Content-retention statements do not describe retention of billing or other operational metadata.

```json
{
  "capabilities": [{
    "id": "text.generate",
    "training_policy": "no_train",
    "retention_mode": "none",
    "retention_days": 0,
    "zero_data_retention": true,
    "zdr_eligibility": "eligible",
    "requirements": { "contract_mode": "none", "account_settings": [] },
    "privacy_policy_url": "https://provider.example/privacy",
    "terms_of_service_url": "https://provider.example/terms",
    "notes": "Request and response content is not retained after delivery."
  }]
}
```

This is the `data_policy` object, not a complete feed. Other required model, capability, tier and pricing fields remain unchanged. Existing v1.0/v1.1 feeds continue to work and reject v1.2-only fields.

| Field | Values |
| --- | --- |
| `training_policy` | `unknown`, `may_train`, `no_train`, `opt_out_available`, `enterprise_no_train` |
| `retention_mode` | `unknown`, `none`, `transient`, `fixed`, `until_deleted` |
| `retention_days` | `0` for none; positive maximum duration in days for fixed/transient; `null` for unknown/until_deleted. Transient includes temporary content retention after delivery and does not grant active ZDR. |
| `zero_data_retention` | `true`, `false`, or `null` (unknown). True means active end-to-end ZDR on this offer, not an optional programme. |
| `zdr_eligibility` | `unknown`, `eligible`, `ineligible`, `conditional`. Eligible requires an active true guarantee; false cannot be eligible. |
| `requirements.contract_mode` | `none`, `customer_agreement`, `enterprise_agreement` |
| `requirements.account_settings` | Up to 16 objects with `id`, `description`, and HTTPS `documentation_url` |
| Evidence | HTTPS `privacy_policy_url` and `terms_of_service_url`; optional bounded `notes` |

Capability IDs are canonical, even if the model lists a protocol alias such as `responses`. Duplicate policies and undeclared capabilities are rejected. Every declaration includes the fields above except notes. Unknown nested fields are rejected.

For this release, an active ZDR guarantee is supported only for unconditional `text.generate` on non-batch tiers: no training, no content retention, zero retention days, eligible, no agreement requirement and no required account settings. Other capabilities can declare facts, but cannot grant ZDR. Conditional declarations are retained for review and remain inactive; the feed cannot establish account-setting or agreement fulfilment, including for BYOK.

## Approval and withdrawal

Phaseo independently approves a provider's policy source. Provider onboarding approval alone does not approve privacy claims. Providers cannot send confidence or verification fields. Approval is bound to the current catalog URL, remote/managed mode and privacy-policy evidence URL. A different source or evidence URL needs a new review.

Catalog declarations and manual Phaseo overrides have separate ownership. A manual pin wins, so coordinated adoption must remove any superseded pins after comparing the effective results. A change to an already pinned offer does not silently overwrite the pin.

For a previously catalog-managed route, false, null, a missing policy/capability entry or a downgrade to a legacy document withdraws its catalog guarantee. It cannot inherit a provider-wide Yes after withdrawal. Legacy routes that have never opted into catalog policy retain their existing behaviour.

Fetch failures leave the last accepted declaration on record, but it stops granting ZDR 24 hours after the last successful validation. HTTP 304 refreshes freshness. Managed catalogs are periodically revalidated too. Revoking approval takes effect without another successful provider fetch. Gateway and public projections recheck approval; gateway catalogue caches for managed policies have a five-minute hard boundary. Public pricing cache freshness is five minutes with no stale serving. Existing already-open pages update on their next data/render refresh.

## Operator API

An authenticated Phaseo administrator can use:

```http
PUT /api/internal/provider-catalog/providers/{providerSlug}/data-policy-approval
Content-Type: application/json

{"enabled":true,"privacy_policy_url":"https://provider.example/privacy"}
```

Send `enabled:false` to revoke approval. Source identity and actor are resolved server-side. The approval table is inaccessible to provider clients; every approval mutation is recorded in an append-only audit table. The response includes cache purge status; approval persistence is separate from cache purge availability.

Declarations remain in the existing tier JSON in snapshots/candidates. Promotion replaces capability `metadata.catalog_data_policy`; existing `metadata.data_policy` pins remain untouched. `resolve_catalog_data_policy` supplies the effective policy to `v2_effective_route_capabilities`, pricing and gateway snapshot RPCs. A missing approval or expired declaration produces an explicit denial, not a positive provider fallback.

## EmpirioLabs adoption

EmpirioLabs should map its native text-model information to explicit declarations in its catalog feed generator. Phaseo does not derive privacy policy from the separate discovery watcher's `native_inference` flag. Confirm the actual feed mode and IDs, preview the current six guarantees and third-party controls, then approve the source and transfer the six manual pins only after verification. No production adoption is included in this change.
