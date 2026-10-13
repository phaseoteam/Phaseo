# Subscription catalogue

These records describe external providers' plans. They do not bill Phaseo customers or grant workspace entitlements.

## Structure

| Record | Responsibility |
| --- | --- |
| `v2_subscription_plans` | Stable plan identity, organisation, audience and lifecycle |
| `v2_subscription_plan_offers` | Billing cadence, currency, region, seat minimum and purchase link |
| `v2_subscription_offer_prices` | Concurrent base/seat/metered charges and sequential introductory/renewal phases |
| `v2_subscription_feature_definitions` | Stable feature key, display label, category and value type |
| `v2_subscription_plan_features` | Feature access, typed values, conditions and original published wording |
| `v2_subscription_plan_allowances` | Quotas, credit grants, concurrency, relative usage, windows, allocation, pools and overage |
| `v2_subscription_plan_models` | Canonical model mappings, access channel, selection mode and mapping evidence |

Offer amounts are actual charges for the stated billing interval. An annual $240 charge remains $240/year; it is not stored as $20/month. `billing_interval_count=3` with `billing_interval=month` represents quarterly billing. Price phase cycles describe time since subscription starts, independently of the record's catalogue effective dates.

`free`, `fixed`, `starting_at`, `custom`, `usage_based` and `unknown` have separate meanings. Custom and unknown amounts are null. Currency credits and provider credits use different units; no conversion to tokens is implied. Per-seat allocation and organisation-wide pooling are independent. Multiple allowance records can represent five-hour and weekly windows; reset semantics may remain unknown even when their duration is published.

Every fact can retain a source URL, verification timestamp and original text. Unknown, approximate and conditional values remain explicit. Marketing model labels without a confirmed API mapping stay in feature text; existing model mappings are unverified unless their evidence establishes otherwise.

## Migration and history

The forward migration groups existing price variants by organisation and plan ID, preferring an active monthly UUID as the canonical identity. Every original plan row and price remains unchanged as historical evidence. Each former price row becomes an offer. Noncanonical plan rows have `status=merged` and point at the canonical UUID. Model associations and otherwise missing features are copied to the canonical record; old rows remain available for audit. Conflicting billing-variant wording stays in the original records rather than being silently reconciled.

The backfill parses explicit quantities and known catalogue patterns. It does not invent quantities, unpublished promotional prices, currency conversions or stable model IDs. Original feature wording and metadata remain available when interpretation is uncertain. Legacy feature keys are deterministic and can later be mapped to curated definitions through the admin catalogue.

`get_v2_subscription_catalogue` is the application read boundary. It filters plan, offer, component, feature, allowance and model effective dates, excludes merged/retired plans and hides nonpublic models. The hidden-model option requires the database service role. The existing `prices` response envelope is derived from offers for model/comparison consumers; it is not another authoring source.

All new tables enable RLS. Anonymous/authenticated roles can read, while service-role writes pass through the existing admin identity, optimistic concurrency and actor-history boundary. Ownership cannot move between plans or offers. Removal guards preserve rows; use effective dates to retire facts. The model editor creates a plan, first offer and charges in one transaction.

## Rollout and verification

1. Merge through the normal PR flow. Production migration CI applies the reviewed forward SQL before the new application readers deploy. Do not deploy the new reader against the old schema.
2. Confirm `get_v2_subscription_catalogue()` returns the expected active plan identities and offers. Inspect custom, annual, quarterly and composite plans in the app.
3. Manage plans, offers, prices, features, allowances and model access through `/internal/data` registries.

The schema is additive. Reverting the application deploy restores the previous readers without removing migrated data. Do not drop new tables or restore a database snapshot to roll back this catalogue change. Historical pricing columns are retained for old readers, but are no longer editable in the new app.

Run deterministic contracts with `node supabase/tests/structured-subscriptions.test.mjs`. To replay a read-only catalogue export locally, set `SUBSCRIPTION_SNAPSHOT` to a JSON file with `plans`, `features`, `models`, `labs`, and `model_catalogue` arrays. No test writes to a live database. The test is also included in declarative schema CI.
