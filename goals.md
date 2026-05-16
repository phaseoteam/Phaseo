# Goals

## Standing Constraint

- Do not mention competitor names in shipped product UX, docs, feature copy, or implementation-facing naming for any of the work below.

## 1. Guardrails

Status: `done`

### Core guardrail model

- [done] Guardrails are created under a workspace.
- [done] Guardrails can be applied to API keys.
- [done] Guardrails are visible from the current API key management surface.

### Budget policies

- [done] Support budget policies on API keys.
- [done] Allow credit limits for daily, weekly, and monthly windows.
- [done] Define clear enforcement behavior when a limit is reached.

### Model and provider access restrictions

- [done] Add provider restriction controls.
- [done] Add model restriction controls.
- [done] Support two restriction modes:
  - `Allow all except`
  - `Only allow`
- [done] Show a live preview of the resulting allowed and blocked models/providers based on the current settings.

### Prompt injection protection

- [done] Add prompt injection protection to guardrails.
- [done] Support actions for:
  - `Flag`
  - `Redact`
  - `Block`
- [done] Investigate detection quality, false-positive handling, and how results should appear in logs and activity views.

### Sensitive info detection

- [done] Investigate and design a sensitive info detection system for guardrails.
- [done] Support configurable handling for deterministic sensitive data classes:
  - Email addresses
  - Phone numbers
  - Social Security numbers
  - Credit card numbers
  - IP addresses
- [done] Add higher-latency entity detection for:
  - Person names
  - Physical addresses
- [done] Support per-pattern actions for deterministic rules:
  - `Flag`
  - `Redact`
  - `Block`
- [done] Support custom patterns, likely via regex or equivalent rule definitions.
- [done] Add a test/preview input so users can see what content would be redacted or blocked before saving.
- [done] Investigate performance tradeoffs for higher-latency pattern types such as entity detection.

### Guardrail enforcement visibility

- [done] Add a Guardrail Enforcement area to the activity page.
- [done] Show counts and trends for requests that were:
  - Blocked
  - Redacted
  - Flagged for review
- [done] Make workspace-policy and guardrail-driven blocks visible in request logs.
- [done] Make guardrail actions visible in API key-level views where appropriate.

## 2. Agent SDK

- [done] Design and build an Agent SDK for long-running agentic applications.
- [done] Prioritize strong developer experience, clear primitives, and high-quality documentation.
- [done] Ground the SDK in familiar market patterns, but push beyond them with a simpler and more capable developer workflow.
- [done] Ensure the SDK supports durable execution patterns and practical production use cases without becoming a hosted orchestration platform.
- [done] Define the core abstractions, lifecycle model, examples, and quickstart experience before expanding breadth.
- [done] Create the first TypeScript package scaffold with agent definitions, a basic run loop, runtime tools, and an application-owned persistence contract.
- [done] Add a gateway-backed client adapter on top of the TypeScript SDK so agent runs can execute through the live gateway.
- [done] Ensure the gateway-backed Agent SDK adapter preserves assistant tool-call history and serializes tool outputs correctly for live multi-step Responses runs.
- [done] Publish the first TypeScript Agent SDK docs page and package-local `SKILL.md` so the install path has a real quickstart.
- [done] Add explicit human pause/resume checkpoints to the TypeScript Agent SDK and persist updated step state through the application-owned store contract.
- [done] Add structured lifecycle event hooks to the TypeScript Agent SDK for run, step, model, tool, and checkpoint activity.
- [done] Prove the TypeScript Agent SDK can support durable remote resumability through a concrete store implementation, then narrow the shipped product surface back to the exported store interface only.
- [done] Add store-backed run discovery and `resumeLatestRun()` so workers can recover the newest incomplete run without already tracking the run id.
- [done] Add store-backed run leases so competing workers fail fast instead of resuming the same run concurrently.
- [done] Automatically renew active run leases during Agent SDK execution so long-running workers do not lose their lease mid-run.
- [done] Add public `getRun()` and `listRuns()` helpers so workers and admin flows can inspect persisted runs without reaching into store implementations directly.
- [done] Add checkpoint-level `cancelRun()` support so paused or queued runs can be stopped cleanly before another worker resumes them.
- [done] Persist Agent SDK runs as `failed` when model or tool execution throws so operational recovery does not leave runs stuck in `running`.
- [done] Add per-tool timeout support with propagated abort signals so local tool dependencies cannot hang Agent SDK workers indefinitely.
- [done] Allow the gateway-backed Agent SDK adapter to pass through gateway-native request defaults such as structured outputs, plugin policy, web search options, provider options, and prompt cache keys.
- [done] Allow the gateway-backed Agent SDK adapter to pass upstream-native tool definitions and tool-choice defaults so agent workflows can use managed gateway tools such as web search without rebuilding raw request payloads.
- [done] Persist the active Agent SDK step as `failed` when model execution, local tool execution, or final output parsing throws so worker recovery has durable step-level failure state.
- [done] Add bounded Agent SDK model retries with definition-level and run-level policy controls so transient model failures can retry before the runtime persists a terminal `failed` run.
- [done] Persist Agent SDK model-attempt counts on step records and lifecycle events so retry behavior is operationally visible after a run completes or fails.
- [done] Add first-class preset-driven routing to the Agent SDK so agent definitions, run calls, resumes, and the gateway-backed adapter can target dashboard presets without manually hard-coding `model: "@slug"` aliases.
- [done] Add a packaged support-triage Agent SDK example and cookbook recipe covering preset-driven routing, strict JSON, bounded retries, human review pauses, and guardrail-aware failure handling.
- [done] Add a packaged coding-review Agent SDK example and cookbook recipe covering local runtime tools, strict JSON, step checkpoints, and approval pauses.
- [done] Add a packaged example and cookbook recipe for bounded concurrent local tool execution in one Agent SDK turn so multi-tool workflows have a clear adoption path.
- [done] Persist upstream native response ids on Agent SDK step records and lifecycle events so operators can correlate SDK runs back to gateway request logs and provider-facing responses.
- [done] Wrap gateway HTTP failures in a typed Agent SDK error so worker code can branch on status, request ids, policy blocks, provider diagnostics, and routing diagnostics without parsing opaque exception strings.
- [done] Persist structured gateway failure diagnostics on failed Agent SDK runs, steps, and `run.failed` events so worker recovery can inspect gateway policy and routing failures after the original exception path is gone.
- [done] Emit `step.failed` before `run.failed` so Agent SDK workers and operator pipelines can observe the exact failed step boundary with retry counts, request correlation data, and persisted gateway diagnostics.
- [done] Allow the Agent SDK gateway adapter to opt into gateway `meta` blocks and persist successful response metadata on step records and lifecycle events so operator tooling can retain routing and plugin details after success paths complete.
- [done] Extend successful gateway `meta` blocks with response-cache and guardrail-enforcement diagnostics, and keep cached hit responses from replaying stale cache-state metadata, so Agent SDK `responseMeta` and direct API callers both see accurate operational success metadata.
- [done] Add bounded concurrent local tool execution to the Agent SDK with deterministic tool-result ordering so independent tool calls in one model turn do not serialize unnecessarily.
- [done] Emit `step.completed` after persisting successful checkpointed step state so workers and operator pipelines have a durable success-path boundary that mirrors `step.failed`.
- [done] Respect run-level `preset`, `modelRetry`, and `toolExecution` overrides on the initial `run()` path so fresh Agent SDK runs honor the same runtime controls already supported on resumed runs.
- [done] Emit `run.resumed` with the previous persisted run status so worker orchestration can distinguish fresh starts from leased resumes.
- [done] Export the remaining public Agent SDK run/resume option and tool-execution config types from the package entrypoint so typed worker wrappers do not need internal type-path imports.
- [done] Emit `model.failed` and `tool.failed` before the broader step/run failure hooks so worker telemetry can observe the precise failing model or tool boundary.
- [done] Allow local runtime tools to declare structured input schemas so the gateway-backed Agent SDK adapter can expose precise function parameter contracts to upstream models instead of generic object payloads.
- [done] Observe external `cancelRun()` calls during active Agent SDK execution so workers stop at safe boundaries after model turns or tool batches, and persist the in-flight step as `cancelled` instead of continuing to completion.
- [done] Emit `step.cancelled` before `run.cancelled` when active external cancellation is observed so worker orchestration and operator pipelines can capture the exact cancelled-step boundary with persisted step metadata.
- [done] Narrow the shipped Agent SDK surface back to an installable application SDK by removing the bundled Upstash Redis checkpoint adapter and the worker/remote-checkpoint cookbook surface, while documenting custom user-owned store implementations in detail.
- [done] Remove shipped concrete checkpoint-store implementations from the public Agent SDK surface so persistence remains an application-owned concern rather than an SDK-provided subsystem.
- [done] Remove the public checkpoint-store contract and store-oriented admin APIs from the shipped Agent SDK surface, and simplify resume semantics to continue from SDK-returned run state instead.

## 3. Video, Batch, and Webhook Infrastructure

### Video and batch pipelines

- [done] Review the current video pipeline end to end.
- [done] Review the current batch pipeline end to end.
- [done] Standardize request handling, execution lifecycle, event generation, and status reporting across both.
- [done] Standardize async webhook event generation and delivery observability across both job types.
- [done] Add a shared normalized lifecycle status for async job payloads and dashboard views.
- [done] Expose a shared normalized `lifecycle_status` field on the public batch and video route responses while preserving native `status` values for compatibility.
- [done] Expose batch public-route affordances directly with `polling_url` and conditional `cancel_url` fields.
- [done] Standardize remaining route-level request handling and status semantics across both public APIs.

### Webhooks

- [done] Review webhook delivery for current async video and batch jobs.
- [done] Standardize event names, payload structure, and delivery semantics across async jobs.
- [done] Ensure webhook sending is fully wired up and operational for async video and batch jobs.
- [done] Define retry behavior, signing/verification, and observability for async video and batch deliveries.

## 4. Documentation, Cookbook, and Skills

### Cookbook and guides

- [done] Build a cookbook/guides section in the documentation.
- [done] Cover common platform workflows and real-world scenarios so users can get productive quickly.
- [done] Include a broad range of examples across SDKs, APIs, routing, tools, agents, caching, and guardrails.
- [done] Add a cookbook recipe for durable TypeScript agent loops on top of the gateway.
- [done] Add a cookbook recipe for Agent SDK runs backed by Upstash Redis checkpoints.
- [done] Add a cookbook recipe for queue-worker Agent SDK runs with durable resume points.
- [done] Add a cookbook recipe and packaged example for multi-worker Agent SDK run inspection, leased resume, and cancellation flows.
- [done] Add a packaged example and cookbook recipe for a structured-output research agent that combines managed web search and response healing through the gateway-backed Agent SDK adapter.
- [done] Add cookbook recipes for guardrails rollout, response caching with presets, and native web-search debugging.
- [done] Add cookbook recipes for structured-output response healing and `gateway:web_fetch` grounding workflows.
- [done] Add a cookbook recipe for workspace, preset, and request-level plugin defaults with locked response-healing policy.
- [done] Add cookbook recipes for the official Python and TypeScript SDKs that show preset-driven routing, structured outputs, managed search, and request-level debugging patterns instead of leaving those workflows implied by reference docs alone.
- [done] Add a cookbook recipe for async batch jobs with polling, cancellation, and standardized webhook delivery so batch integrations have the same scenario coverage as async video jobs.

### Skills repository

- [done] Create a repository of reusable skills for coding agents.
- [done] Include skills that help users work with the platform SDKs and common integration tasks.
- [done] Bundle the appropriate `SKILL.md` file when a user installs an SDK so the coding-agent workflow is enabled immediately.
- [done] Add a reusable repository skill for the TypeScript Agent SDK workflow.
- [done] Add a focused repository skill for guardrails rollout and enforcement debugging.
- [done] Add a focused repository skill for structured-output response healing workflows.
- [done] Add a focused repository skill for native search, `gateway:web_search`, `gateway:web_fetch`, and grounding/debug workflows.
- [done] Add a focused repository skill for preset rollouts, routing diagnostics, and response-cache debugging so coding agents can adopt stable request-shape and observability patterns without rediscovering them.
- [done] Add a focused repository skill for async video, batch, polling, websocket, and standardized webhook lifecycle workflows so coding agents can implement long-running job handling without rediscovering the gateway’s normalized async contract.
- [done] Keep repository skills aligned with shipped operational workflows such as leased Agent SDK resumes, run cancellation, and locked workspace plugin defaults.
- [done] Keep Agent SDK skills and package-local guidance aligned with gateway-native tool defaults for structured-output research workflows.

## 5. UI and Product Surface Improvements

### Hover cards

- [done] Add hover cards for shared entities across the site where they improve usability.
- [done] Initial targets:
  - Models
  - Providers
  - Apps
- [done] Use them in logs and other high-context surfaces, but apply them selectively.

### Model descriptions

- [done] Add descriptions for every model.
- [done] Show model descriptions near the top of each model page.
- [done] Constrain their height so they remain informative without dominating the page.
- [done] Optimize descriptions for clarity, usefulness, and SEO.

### Models page modality filters

- [done] Move output modality buttons from the sidebar to the top of the main models page.
- [done] Keep the current visual language, counts, and overall color treatment, with small adjustments as needed.
- [done] Use ghost-button styling or an equivalent top-of-page treatment that fits the existing design.

### Logs filtering

- [blocked] Improve logs filtering with a more powerful, operator-driven filter builder inspired by modern issue-tracking workflows.
- [done] Add app-level logs filtering to the usage logs query path and filter menu so operators can narrow request logs by workspace app.
- [done] Add endpoint-level logs filtering to the usage logs query path and filter menu so operators can narrow request logs by API surface.
- [done] Add finish-reason logs filtering to the usage logs query path and filter menu so operators can narrow request logs by terminal completion state.
- [done] Add stream-mode logs filtering to the usage logs query path and filter menu so operators can isolate streaming and non-streaming traffic.
- [done] Add error-code logs filtering to the usage logs query path and filter menu so operators can isolate gateway and provider failure classes directly from logs.
- [done] Add HTTP-status logs filtering to the usage logs query path and filter menu so operators can isolate gateway response classes and specific transport outcomes.
- Likely design:
  - Open filters
  - Choose a field/category
  - Open a submenu
  - Pick one or more filter values/operators
- This area needs more product input, so treat it as lower priority for now.

### API key detail pages

- [done] Expand the current API key management surface with:
  - Usage
  - Metadata
  - Spend
  - Quick links/actions for activity and logs
  - Applied guardrails

## 6. Routing, Logging, and Explainability

- Status: `done`

- [done] Add a detailed routing breakdown for API requests.
- [done] Surface workspace-policy and routing-filter diagnostics inside request log error details for blocked/failed requests.
- [done] Log which providers were considered for blocked/failed request diagnostics.
- [done] Log the factors that influenced routing decisions for blocked/failed request diagnostics.
- [done] Provide enough structured data to generate a natural-language explanation of why a request was routed the way it was in detailed request views.
- [done] Expose this in logging and debugging views so users can inspect routing behavior clearly.

## 7. Tools and Provider Capabilities

- [done] Ensure server-side `datetime` works end to end, including deterministic local pipeline coverage.
- [done] Investigate and add other useful tool capabilities supported elsewhere in the market where they fit the platform.
- [done] Add a server-managed `gateway:web_search` tool path backed by Exa so web search works across providers without relying on provider-native search support.
- [done] Document the current native web search blocker and phased rollout plan.
- [done] Enable Phase 1 native web search passthrough and capability gating for OpenAI-compatible request surfaces.
- [done] Add Phase 2 web-search observability for usage counters and citation/search-result metrics in request detail views.
- [done] Persist normalized native web-search results and citation records into request detail metadata for successful requests.
- [done] Persist managed `gateway:web_search` results, queries, and derived citation records into request detail metadata so server-managed search is visible in logs.
- [done] Add a server-managed `gateway:web_fetch` tool path with bounded HTTP fetch, text extraction, and request-level usage tracking.
- [done] Persist managed `gateway:web_fetch` metadata into request detail payloads so fetched pages are visible in logs.
- [done] Add deterministic text-pipeline coverage for managed `gateway:web_search` and `gateway:web_fetch` follow-up loops, including persisted `server_tool_use` metrics on non-stream and streaming paths.
- [done] Persist provider-native search call/query details into successful request metadata when providers expose them.
- [done] Normalize Gemini-style grounding metadata (`webSearchQueries`, `groundingChunks`, and `groundingSupports`) into the shared search observability contract and usage counters.
- [done] Accept explicit `web_search_options` on the `messages` surface and carry them into IR for capability-routing parity with the other text endpoints.
- [done] Explicitly declare `web_search_options` and gateway `plugins` on the `messages` request schema so the Anthropic surface no longer relies on permissive passthrough for those supported fields.
- [done] Explicitly accept Anthropic-native web search tool definitions on the `messages` surface and preserve them through decode and capability routing.
- [done] Add deterministic stream-finalization coverage so successful streamed native-search and managed-search responses are verified to persist the same normalized search observability contract as non-stream success paths.
- [done] Review and improve web search support across providers.
- [done] Evaluate Exa integration as part of the search/tooling story.

## 8. Plugins and Response Healing

- [done] Investigate market-style plugin systems and define a platform-native plugin architecture.
- [done] Build a plugin system that can expand over time without adding excessive complexity to the core request path.
- [done] Include response healing as part of the plugin strategy.
- [done] Define where plugins execute, how they are configured, and how they interact with routing, retries, and logging.
- [done] Allow presets to define default plugin policy with request-level overrides by plugin ID.
- [done] Add workspace-level default plugin policy with precedence `workspace < preset < request`.
- [done] Support locked workspace plugin defaults so preset or request layers cannot override critical plugin policy.
- [done] Reject unknown gateway plugin ids during request validation instead of letting them degrade into silent no-op skips later in the pipeline.
- [done] Explicitly declare gateway `plugins` on the `messages` request schema so the API contract matches the shipped request surface.
- [done] Broaden non-stream response healing to scan multiple text blocks and repair the first recoverable structured JSON candidate.
- [done] When multiple text blocks are present, collapse leading prose plus a later valid JSON block down to the selected canonical JSON payload for deterministic `responses` and `messages` healing behavior.
- [done] Validate candidate healed `json_schema` outputs against required keys, basic types, enums/const values, array bounds, and `additionalProperties: false` before rewriting the payload.
- [done] Extend response-healing schema validation to enforce common string, number, and object constraints and show explicit validation errors in request detail views.
- [done] Accept gateway `plugins` policy consistently on the `messages` request surface.
- [done] Isolate response-plugin failures so a plugin crash records failed execution metadata instead of breaking the whole non-stream request path.
- [done] Surface plugin failure error messages in request detail views so failed plugin executions are directly debuggable from logs.
- [done] Add a bounded response-healing mode model with workspace and preset controls, distinguishing full safe repair from strict unwrap-only behavior.
- [done] Extend response-healing schema validation to cover common string formats and `uniqueItems` array constraints so recovered structured JSON is still checked against higher-signal contracts before rewrite.
- [done] Apply response-healing to streamed terminal `response` and `chat.completion` snapshots so the final streamed frame and persisted plugin metadata stay aligned with the non-stream healing path.
- [done] Replace the branch-driven response plugin path with a typed code-first handler registry that carries explicit stage and streaming-support metadata for future plugin expansion.

## 9. Response Caching

- [done] Investigate response caching at the full-request level.
- [done] Evaluate hashing the full request payload into a cache key and returning a previously stored response on exact match.
- [done] Explore implementing this with Upstash Redis.
- [done] Define cache controls, invalidation rules, observability, and compatibility with presets and routing.
- [done] Implement deterministic response-cache fingerprinting and an Upstash runtime wrapper for the gateway.
- [done] Add an initial non-stream text response-cache read/write path with cache-hit telemetry.

## 10. Presets

- [done] Review presets end to end, including how they are represented and applied in the API layer.
- Support preset configuration for:
  - Name
  - [done] Custom slug
  - [done] System prompt
  - [done] Target models
  - [done] Provider preferences
  - [done] Preferred performance metrics
  - [done] Parameter values such as temperature
  - [done] Response caching configuration and TTL
  - [done] Reasoning configuration/details
- [done] Apply preset routing preferences in the API execution path.

## 11. Free Router

Status: `done`

- [done] Build the first free router endpoint path for `ai-stats/free`.
- [done] Route requests automatically to an eligible free model pool.
- [done] Use an adapted routing algorithm to choose the best free model while balancing load across the pool.
- [done] Define how free-model eligibility is maintained and exposed internally.
- [done] Carry the concrete routed free model through provider context so pricing and execution use the actual free model rather than the virtual router alias.
- [done] Expose the concrete routed free model in request diagnostics and detail views so `ai-stats/free` traffic is debuggable.
- [done] Persist both `requested_model_id` and `routed_model_id` on gateway request audit rows, and surface both in request log views so router traffic is operationally obvious without inferring from nested provider attempts.
- [done] Expose `ai-stats/free` in gateway model catalogue responses so the free router is discoverable to authenticated users.
- [done] Add a dedicated `ai-stats/free` model page that lists currently eligible routed models and per-model router usage.
- [done] Surface `ai-stats/free` as a first-class catalogue card on `/models` with router-specific description and 30-day routed usage metadata.

## Recommended Execution Order

1. Guardrails foundation and enforcement telemetry
2. Routing explainability and logging
3. Webhooks, batch, and video pipeline standardization
4. Presets and response caching
5. Tools and provider capability review
6. Free router
7. API key detail pages and shared hover-card UX
8. Model descriptions and models page filter repositioning
9. Cookbook/guides and skills repository
10. Agent SDK platform
11. Plugin system and response healing

## Immediate Investigation Items

- Higher-latency sensitive info detection for names, addresses, and custom patterns
- Prompt injection detection strategy and enforcement model
- Standard webhook event taxonomy and payload schema
- Routing-decision trace model for logs
- Response caching design with Upstash Redis
- Plugin execution model and response healing design
