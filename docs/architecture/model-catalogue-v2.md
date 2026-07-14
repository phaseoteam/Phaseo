# Model catalogue v2

## Outcome

Phaseo exposes one canonical models API payload, assembled from a small normalized
write model:

1. `data_models_v2` owns provider-independent model facts.
2. `data_api_providers_v2` owns inference-provider identity and policy.
3. `data_api_provider_models_v2` owns a provider's offering of a model.
4. `data_api_provider_model_capabilities_v2` owns endpoint-specific support.
5. SKUs and rates own billing identity, display metadata, and price history.

Every new physical table uses the `_v2` suffix. The live tables remain untouched
throughout testing, allowing an admin-only feature flag to switch reads safely.

The Cloudflare frontend models endpoint reads a purpose-built catalogue RPC/view and
returns the nested payload. Consumers do not join these tables themselves.

## Important boundaries

### Model lifecycle is not routing status

`data_models_v2.status` describes the model itself: announced, active, deprecated, or
retired. Deranking and disabling are routing controls. They remain on providers,
provider-model offerings, and capabilities so one bad provider does not globally
disable the model.

### Limits belong at the narrowest applicable scope

The model row can hold documented default RPM/RPD values. Provider-requested limits
belong on `data_api_provider_models_v2`, with capability overrides only if an endpoint
has a different contract. Runtime resolution is:

```
capability override -> provider-model limit -> model default -> unlimited
```

### Capabilities remain relational

One provider/model combination can expose `text.generate`, `image.generate`,
`video.generate`, or another endpoint with different status, parameters, and token
limits. Squashing these into the provider-model row would either duplicate offerings
or create an unvalidated JSON blob. The capability table stays, while its parameter
schema becomes the canonical home for common/image/video/audio parameter support.

### Prices do not live on models

A stable SKU describes what is billed and how it is shown. A rate describes how much
that SKU costs during an effective period. This permits price history without cloning
display metadata and supports multiple meters per offering.

## Canonical model

`data_models_v2.model_id` is the public ID/slug and `full_name` is the full display
name. V1 identity is copied during backfill without changing existing foreign keys.

| Field | Purpose |
| --- | --- |
| `model_id` | Public API ID and URL slug, for example `openai/gpt-5` |
| `full_name`, `short_name` | Full and compact display names |
| `organisation_id` | Author/owner organization |
| lifecycle dates | Announcement, release, deprecation, retirement |
| `description` | Canonical public description |
| `context_length` | Provider-independent documented default |
| `input_modalities`, `output_modalities` | Canonical modality arrays |
| `hidden` | Public visibility |
| notice fields | Current page notice, tone, and optional active window |
| `supports_reasoning`, `reasoning_config` | Reasoning support and supported efforts |
| `quickstart_example_type_id` | Selects the quickstart renderer/template |
| `knowledge_cutoff`, `knowledge_cutoff_precision` | Cutoff and its published precision |
| `default_rpm`, `default_rpd` | Optional documented global defaults |
| `supported_voices` | Nullable structured canonical voice catalogue |

`reasoning_config` is an object. The initial stable shape is:

```json
{
  "efforts": ["none", "minimal", "low", "medium", "high", "xhigh"],
  "default_effort": "medium"
}
```

`supported_voices` is `null` for models without voice selection and an array for
models with voices. Voice objects should contain at least an `id`; display name,
language, description, and preview URL are optional.

## Inference providers

`data_api_providers_v2.provider_id` remains the URL slug and gateway identity.
Existing rollout status and routing status remain separate.

Provider facts include display name, homepage, gateway base URL, icon, status page,
BYOK support, headquarters, default execution/data regions, public prompt-training
policy, the Phaseo-contract override, prompt retention, Terms, and Privacy links.

Provider ownership is held in `data_api_provider_owners_v2`. An owner is either a user
or a workspace, never an unvalidated arbitrary ID. Ownership establishes permission;
mutations still pass through a validated API/RPC rather than granting unrestricted
table updates to authenticated clients.

Datacenter/execution locations are rows in `data_api_provider_regions_v2`, not a single
comma-delimited field. This preserves region IDs and permits residency metadata.

## Provider-model offerings

`data_api_provider_models_v2` contains one row per provider offering. It contains:

- canonical `model_id` and `provider_id` foreign keys;
- the provider's model ID/slug and display name;
- provider-specific context and maximum output tokens;
- provider availability plus independent routing status;
- provider release/deprecation/retirement dates;
- quantization and free-tier flag;
- provider RPM/RPD limits;
- provider-specific voices and prompt-policy overrides.

Endpoint-specific parameter support remains in
`data_api_provider_model_capabilities_v2.parameter_schema`. It uses JSON Schema-style
objects grouped under `common`, `text`, `image`, `video`, and `audio`. The existing
`params` column remains during migration and is the backfill source.

## Billing units, SKUs, and rates

### Canonical billing units

`data_api_billing_units_v2.meter_id` is the ID emitted by the gateway's normalized usage
IR, for example:

- `input_text_tokens`
- `output_reasoning_tokens`
- `output_image`
- `output_video_seconds`
- `native_web_search_requests`

Provider adapters normalize native usage into these IDs before pricing. The pricing
engine never bills provider-native labels directly.

### SKUs

A SKU belongs to a provider-model capability and canonical billing unit. It stores:

- stable `sku_key` and optional provider-native SKU ID;
- `label` and `display_text`;
- UI group (`text`, `image`, `video`, `audio`, `tools`, or `other`);
- display tier (`primary` or `secondary`) and sort order;
- billing unit size;
- display multiplier and unit label;
- pricing plan and currency.

Examples:

| SKU | Meter | Billing | UI display |
| --- | --- | --- | --- |
| text input | `input_text_tokens` | USD per token | USD / 1M tokens |
| video output | `output_video_seconds` | USD per second | USD / second |
| image output | `output_image` | USD per image | USD / image |
| web search | `native_web_search_requests` | USD per request | USD / request, secondary |

### Rates

`data_api_pricing_rates_v2` stores the exact decimal price, conditions, priority,
rate type, promotion name, effective window, and time-window overrides. Every rate
has a non-null `effective_from`; `effective_to = null` means it remains active until
superseded or closed.

Promotional rates are normal rates with `rate_type = 'promotional'`, a required
`promotion_name`, a required `effective_to`, and a higher priority. Resolution is:

1. select rates active at the billing timestamp;
2. filter by pricing plan and match conditions;
3. choose the highest priority for that meter;
4. use the most recent `effective_from` as the deterministic tie-breaker.

Closing a promotion sets `effective_to`; it never overwrites or deletes the rate.
`data_api_pricing_history_v2` exposes all standard and promotional windows.

During transition, `data_api_pricing_rules_v2_compat` presents the existing pricing
engine shape. The loader can switch to this view without changing `PriceRule` or the
billing calculation. Once parity is proven, the legacy `data_api_pricing_rules` table
can be retired.

## Canonical frontend payload

The Cloudflare endpoint should eventually read one catalogue RPC and return:

```json
{
  "models": [
    {
      "id": "openai/gpt-5",
      "name": "GPT-5",
      "modalities": { "input": ["text"], "output": ["text"] },
      "reasoning": { "supported": true, "efforts": ["low", "medium", "high"] },
      "providers": [
        {
          "id": "openai",
          "providerModelId": "gpt-5",
          "status": "active",
          "capabilities": [],
          "skus": []
        }
      ]
    }
  ]
}
```

This is one API response and one cache entry, while the database remains normalized
for safe writes and efficient targeted updates.

## Migration sequence

1. Create only `_v2` tables without altering legacy structures.
2. Backfill canonical model facts, notices, provider offerings, SKUs, and rates.
3. Add validation reports for unresolved model IDs, missing providers, duplicate
   offerings, invalid rates, and unsupported meters.
4. Create the canonical catalogue RPC and compare it against the existing endpoint.
5. Let admins opt into V2 in the web Beta settings while public traffic stays on V1.
6. Switch Cloudflare reads to the RPC and the gateway pricing loader to the
   compatibility view.
7. Dual-write admin/importer changes during a verification window.
8. Remove legacy tables and columns only after read/write parity and billing tests.

No destructive step belongs in the foundation migration.
