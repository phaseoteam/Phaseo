# Glossary

Terms whose meaning matters across Phaseo, using the names the code and schema use. Architecture
constraints and traps belong in the [overview](./overview.md), not in these definitions.

## Accounts and access

| Term | Meaning |
| --- | --- |
| Workspace | The unit that owns members, keys, the wallet, settings and usage. Tables and functions key it as `workspace_id`. |
| Team | The old name for a workspace. Some functions and compatibility views still use `team_id` or `p_team_id`; they mean the workspace ID. |
| Member | A user in a workspace, with the `workspace_role` `owner`, `admin` or `member`. |
| Department | A named group inside a workspace (`workspace_departments`), created by hand or synced from SCIM. Keys and requests can carry a `department_id` for attribution. |
| API key | An inference key, `phaseo_v1_sk_<kid>_<secret>`. The `kid` is the public ID; only an HMAC of the secret is stored, in `keys`. |
| Management key | A control-plane key, `phaseo_v1_mk_<kid>_<secret>`, stored in `management_keys`. The gateway rejects it for inference. |
| OAuth client | A third-party app registered in `oauth_clients` that asks users for access through Phaseo OAuth. |
| OAuth delegated key | An opaque key issued to an OAuth client for one user in one workspace (`keys.key_kind = 'oauth_delegated'`). Every request re-checks that the authorization and membership are still active. |
| Workload identity key | A key with no usable secret (`keys.key_kind = 'workload_identity'`) behind a trust policy (`workload_identity_policies`). A Vercel or GitHub Actions OIDC token that matches the policy authenticates as that key. |
| BYOK key | A customer's own provider key (`byok_keys`), stored encrypted. Its `routing_mode` decides whether it is tried before or after Phaseo's managed key. Providers and routes with `credential_mode = 'byok_only'` accept only BYOK keys. |

## Catalogue

| Term | Meaning |
| --- | --- |
| Model ID | The canonical model identity, `v2_models.model_slug`, such as `openai/gpt-6-astra`. It is lowercase and must start with the organisation's slug. |
| Organisation | Who made the model. The UI and public API say organisation; the database says lab (`v2_labs`, `lab_slug`). |
| API provider | Who serves a model (`v2_providers.provider_slug`). Regional offers such as `openai-eu` are separate providers. An `external` provider is catalogue-only. |
| Provider route | One provider serving one model (`v2_model_provider_routes`), identified by `provider_model_id`. Pricing, usage and health attach to the route. The upstream's own model name is `provider_model_slug`, never the canonical model ID. |
| Provider-qualified model | A request model written `provider:organisation/model`. It pins the request to that one route; presets and routing hints cannot widen it. |
| Alias | Another spelling that resolves to a canonical model ID (`v2_model_aliases`). Aliases have effective windows and historical ones are kept. |
| Family | A group of related models, such as one product line (`v2_model_families`, `family_slug`). |
| Free variant | A separate model identity ending in `:free` (`variant_kind = 'free'`). Its routes, usage and health are never merged into the base model. |
| Route variant | One offer of a route in a region and service tier (`v2_route_variants`). Unrelated to free variants. |
| Service tier | A provider's processing class, such as `standard`, `flex`, `priority` or `batch` (`v2_service_tiers`). Prices carry their tier. |
| Model status | The record state of a model row: `draft`, `active`, `deprecated`, `retired` or `disabled` (`v2_models.status`). |
| Catalogue status | The model's public lifecycle, from `unknown` and `rumoured` through `available` to `retired` or `withheld` (`v2_models.catalogue_status`). It never makes a route callable. |
| Provider availability status | What the provider offers upstream, including `coming_soon` and `removed` (`provider_availability_status`). |
| Phaseo status | Phaseo's integration state for a route, such as `planned`, `testing`, `enabled` or `disabled` (`phaseo_status`). Only `enabled` routes can route. |
| Access scope | Whether a route serves customers (`public`) or only authenticated testing-mode requests (`internal`). |
| Routing enabled | The switch that makes a route callable (`routing_enabled`). `is_active_gateway` is its legacy name in compatibility views and RPC output. |
| Pricing SKU and meter | A versioned price attached to a route (`v2_pricing_skus`) and its billable dimensions (`v2_pricing_sku_meters`), each with a `meter_key` such as `input_text_tokens`. |
| Subscription plan | A catalogue record of an external provider's consumer or team plan (`v2_subscription_plans`). It does not bill Phaseo customers or grant entitlements. |

## Requests and routing

| Term | Meaning |
| --- | --- |
| Data plane, control plane | Gateway routes that run models ([`routes/v1/data`](../../apps/api/src/routes/v1/data)) versus routes that manage keys, workspaces, presets and settings ([`routes/v1/control`](../../apps/api/src/routes/v1/control)). The Management API is the control plane. |
| Endpoint | The gateway's internal name for a public operation, such as `chat.completions`, `responses` or `images.generations` (`Endpoint` in [`core/types.ts`](../../apps/api/src/core/types.ts)). |
| Capability | The routing vocabulary stored in the database, such as `text.generate`, `image.generate` or `audio.transcription`. One capability can serve several endpoints. |
| Protocol | A public wire format the gateway decodes and encodes, such as `openai.chat.completions`, `openai.responses` or `anthropic.messages` ([`protocols`](../../apps/api/src/protocols)). |
| IR | The internal request and response representation every protocol decodes into ([`core/ir.ts`](../../apps/api/src/core/ir.ts)). Executors only see the IR. |
| Surface | The per-endpoint pipeline runner chosen in [`pipeline/registry.ts`](../../apps/api/src/pipeline/registry.ts). All text protocols share one surface. |
| Executor | The code that calls one provider for one capability ([`executors/<provider>/<capability>`](../../apps/api/src/executors)). There is no generic fallback executor. |
| Preset | A saved model, prompt and routing configuration called with `"model": "@slug"`. Presets are versioned and can be private to their creator. |
| Routing preferences | The request's `routing` object (or legacy `provider` object): provider order, allow and ignore lists, fallbacks, regions, ZDR and data collection. |
| Routing mode | Two unrelated things: a request's provider ranking (`balanced`, `price`, `latency`, `throughput`) and a BYOK key's `routing_mode` (`priority`, `fallback`). |
| Provider failover | Retrying the same model on the next ranked provider. `routing.allow_fallbacks` controls it. |
| Model fallback | Rerunning the whole pipeline with another model after a 429, 500, 502, 503 or 504, or when no provider serves the model. Sources are the request `models` list, a dynamic route or the auto router. |
| Dynamic route | A workspace routing policy assigned to keys: a graph of conditions, percentage splits, model choices and fallbacks. |
| Router models | `phaseo/auto` classifies the request and picks a model; it cannot be combined with `models`. `phaseo/free` routes among free models. |
| Successor routing | Sending requests for a model no provider has served for 72 hours to an admin-approved successor (`v2_model_successor_routing`). Off by default; each workspace opts in and sets a price policy. |
| Guardrail | A workspace, key or member policy that restricts models and providers, sets privacy rules and request or cost limits, and can block or redact prompt injection and sensitive data. |
| Rate limit policy | A named limit on requests per minute, tokens per minute or concurrent requests that an admin assigns to keys, members, departments, guardrails or end users (`workspace_rate_limit_policies`). |
| Customer rate limit | A request quota per minute for each key owner in a workspace, plus a daily free-model quota, counted by a Durable Object. A scheduled job sets each workspace's tier. |
| Provider rate limit | An upstream quota on Phaseo's managed credentials, counted across all customers so Phaseo stays within it. |
| ZDR | Zero data retention. Providers declare it (`zero_data_retention`); requests and guardrails can require it. |
| I/O logs | Opt-in capture of request and response payloads to R2, tracked in `gateway_io_logs`, with a retention period. |

## Billing and usage

| Term | Meaning |
| --- | --- |
| Wallet | A workspace's prepaid credit balance (`wallets`). Invoice-billed workspaces use billing mode `invoice` instead. |
| Nanos | The money unit: integer US dollars × 10⁹. Prices, costs and balances are stored and computed in nanos. |
| Charge | The debit for a synchronous request after it completes. It is idempotent per request (`gateway_request_charges`). |
| Reservation | A hold on wallet credit taken when a batch or video job is created (`gateway_wallet_reservations`). It is later captured, released or settled; settlement charges the job's actual cost, which may exceed the hold, and frees the hold in one step. |
| Credit ledger | Balance changes from top-ups, credit codes and captured or settled reservations (`credit_ledger`). Synchronous request charges are recorded per request in `gateway_request_charges` instead. |
| Budget | A workspace spend cap per day, week, month or lifetime (`workspace_budgets`), checked on the request path. Keys have their own request and cost limits. Department budgets (`workspace_department_budgets`) only alert. |
| Spend rule | A threshold on spend for a workspace, key, member, department, model or provider that notifies, or notifies and then blocks (`workspace_spend_rules`). Spend is evaluated every five minutes, so a block starts minutes after the threshold. |
| Request record | The authoritative row for one gateway request (`gateway_requests`). `v2_request_facts`, attempts, usage and pricing lines extend it. |

## Asynchronous work

| Term | Meaning |
| --- | --- |
| Async operation | A long-running job tracked in `gateway_async_operations`, of kind `video`, `batch` or `music`. |
| Batch | An uploaded JSONL file of requests run by a provider's batch API through `/v1/batches`. It reserves credit on create and is priced from its output file. |
| Provider event | An inbound provider webhook stored once per event ID (`gateway_provider_events`), so repeated deliveries are ignored. |
| Webhook endpoint | A customer URL that receives signed video and batch events (`gateway_webhook_endpoints`, header `x-phaseo-signature`). |
| Notification destination | Where workspace alerts such as model deprecations go: email, Slack, Discord, Microsoft Teams or a custom webhook (`notification_destinations`). |
| Broadcast destination | A workspace export of per-request telemetry as OTLP traces, webhook events or rows in a warehouse or object store (`workspace_broadcast_destinations`). |
| Realtime session | A voice WebSocket session relayed by a Durable Object, with an extendable credit hold (`gateway_realtime_sessions`). |
| Workspace publication | A queued notice that a workspace's settings changed (`gateway_workspace_publications`). Draining it invalidates that workspace's cached gateway context. |
| Catalogue revision | A value from `gateway_catalogue_revision()` published to KV each minute. Gateway isolates refresh catalogue snapshots when it changes. |

## Docs and SDKs

| Term | Meaning |
| --- | --- |
| OpenAPI spec | [`apps/docs/openapi/v1/openapi.yaml`](../../apps/docs/openapi/v1/openapi.yaml), the one v1 contract. Localised copies for docs are generated from it and never used for SDKs. |
| Generated SDK | The client code produced by `pnpm openapi:gen` for TypeScript, Python, Go, C#, Java, PHP, Ruby, C++ and Rust. Handwritten wrappers in the same packages sit on top of it. |
| Agent SDK | A separate handwritten package per language (`packages/sdk/agent-sdk-*`) for agent loops on top of the gateway. It is not generated from the spec. |
| Locale code | The web app uses `en-GB`, `en-US`, `ar-SA`, `de-DE`, `es-ES`, `fr-FR`, `hi`, `ja`, `pt-BR` and `zh-Hans`. The docs use `en`, `ar`, `de`, `es`, `fr`, `hi`, `ja`, `pt-BR` and `zh-Hans`. |
| Skill | An agent instruction pack in [`.agents/skills`](../../.agents/skills). `pnpm skills:sync` copies public skills to the docs site and the Phaseo plugin, and every skill, internal ones included, to `.claude/skills` for Claude Code. |
