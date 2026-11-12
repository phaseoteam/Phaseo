# Provider catalog field coverage

V1.2 supports the following declaration groups. This is a semantic field inventory, not compatibility with another feed format. Existing v1.0/v1.1 fields retain their names and behaviour.

The main model fields and `service_tiers[].pricing` describe the effective offer to publish. Optional `declarations` on a model or individual tier retain additional provider claims for review. A declaration is not an instruction to change billing, execute a parameter or enable a capability. The validator returns explicit warnings for these blocks; catalog reads expose `declaration_warnings`, and sync history retains them.

| Concept | Phaseo field | Current application |
| --- | --- | --- |
| Canonical model identifier | `data[].id` | Existing matching and approval rules |
| Upstream identifier | `service_tiers[].provider_model_slug` | Applied to the offer |
| Model display name and description | `name`, `description` | Existing canonical ownership/review rules |
| Weights identifier | `declarations.hugging_face_id` | Stored for review |
| Creation timestamp | `declarations.created_at` | Stored for review, RFC 3339 |
| Quantization | `declarations.quantization` | Stored for review; null means undeclared |
| Tokenizer | `declarations.tokenizer` | Stored for review |
| Input/output modality list | Existing `input_modalities`, `output_modalities` | Existing route publication rules |
| Context and output limits | Existing `context_length`, `max_output_tokens` | Existing route publication rules |
| Typed media declarations | `declarations.input_modalities`, `.output_modalities` | Stored for review |
| Streaming | Output declaration `streaming` | Does not enable an adapter |
| Typed parameters and defaults | Output declaration `supported_parameters` | Stored for review; does not enable support |
| Provider-specific parameters | `passthrough_parameters` at declaration/model input/output scopes | Stored for review; not forwarded automatically |
| Effective pricing | Existing tier `pricing` | Existing meter validation and billing |
| Input/output/request prices | Scoped declaration `pricing` | Stored for review; nanos and explicit unit quantities |
| Cached reads and writes | Declared price kinds `cached_read`, `cache_write` | Cache TTL/implicit qualifiers stored; existing billable meters remain authoritative |
| Reasoning and search prices | Declared price kinds `reasoning`, `web_search` | Stored for review |
| Conditional prices | Price `overrides` with `when` | Stored, not automatically billed |
| Scheduled prices | Price `schedule` | UTC windows/days stored, not automatically billed |
| Throughput and request capacity | Scoped declaration `capacity` | Minute/hour/day declarations stored |
| Concurrency | Capacity `kind: concurrency` | Request count, no time window; stored |
| Operational limits | Existing `rate_limits` | Applied to provider account using existing routing behaviour |
| Readiness | Existing `availability` | Ready/not-ready/degraded/deprecated/retired |
| Release and retirement | Existing `available_from`, `deprecated_at`, `shutdown_at` | Existing lifecycle behaviour |
| Normalized offer tiers | Existing `service_tiers` | Standard/fast/ultrafast/flex/batch |
| Free offer attestation | `declarations.is_free` | Stored; actual billing still comes from effective prices |
| Discount or markup | `declarations.discount_to_user` | Stored; values below 1, including negative markup; no automatic price multiplication |
| Datacenters | `declarations.datacenters` | Country/region stored; does not grant residency |
| Deployment region | `declarations.deployment_region` | Stored; does not grant residency |
| Training, retention, active ZDR | Tier `data_policy.capabilities` | Separate Phaseo approval and conditional/expiry rules |
| Policy evidence/requirements | Tier policy URLs, notes and requirements | Stored; provider cannot self-verify |

## Typed inputs and outputs

Inputs cover text, image, video, audio and file. Outputs cover text, image, video, speech, transcription, embeddings, rerank and audio.

Input constraints cover context length versus maximum prompt length; URL/base64 sources; MIME formats; image detail levels and reference/frame roles; reference counts; duration; and maximum content size. Limits carry a value and optional unit. Output declarations include supported parameter descriptors, streaming and maximum length.

Parameter descriptors support numeric ranges, integers, booleans, enums, arrays, objects and explicitly unknown domains. Nested arrays/objects and defaults are represented. Nesting and node counts are bounded, and defaults/ranges receive semantic validation.

## Declared price and capacity scopes

Input price kinds are `input`, `cached_read`, `cache_write`. Output price kinds are `output` and `reasoning`. Root request price kinds are `request` and `web_search`. Units cover token, image, megapixel, second, character, request and search as appropriate to the scope. Financial values use safe integer nanos per explicit unit quantity rather than binary floating-point dollars.

Conditional overrides combine field comparisons using `all`, `any` and `not`; leaf comparisons support `eq`, `in`, `gt`, `gte`, `lt`, `lte`. Time windows use UTC start/end times and optional weekday names. Cache qualifiers specify TTL seconds and implicit versus explicit caching. Duplicate prices in the same qualified scope are rejected.

Capacity declarations support input/output/cached-read throughput, request limits and concurrent requests. Throughput requires a minute/hour/day window. Concurrency is an integer request count without a window. Duplicate scoped capacity entries are rejected.

## Storage and activation

Model declarations survive normalization, override/draft round trips and snapshot metadata. Tier declarations survive in `serviceTiers`. Promotion retains both in route `metadata.catalog_declarations` with `status: stored_for_review` and source-run provenance.

No additional provider-controlled declaration modifies canonical model identity, residency, adapter configuration or billable prices. Those require the existing reviewed publication paths. Privacy declarations have their own approval mechanism, described in `provider-catalog-v1.2.md`.

Unknown fields are rejected rather than silently ignored. Updates remain full snapshots. Withdrawing a rich declaration replaces the stored claim; withdrawing a privacy guarantee also follows the explicit denial rules. Download the v1.2 schema and validate a complete feed before publishing.
