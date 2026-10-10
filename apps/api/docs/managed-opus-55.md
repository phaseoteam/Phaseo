# Managed Claude Opus 5.5

Investigation on 2026-10-10, based on main `0ba84a01ed` and read-only production
catalogue and Worker settings. No live inference was performed.

## Customer failure

Production has `google-vertex`, `google-vertex-eu`, and `amazon-bedrock` Opus 5.5
routes disabled with `routing_enabled=false`, upstream availability
`coming_soon`, Phaseo status `planned`, and `text.generate` capability status
`degraded`. Their evidence is September release-preparation metadata. The
deployed `gateway_fetch_public_catalog_at` result contains neither requested
managed provider. Pinning `google-vertex` therefore leaves no candidate and
returns the reported provider-filter error. BYOK is not required by these
routes' `managed_and_byok` credential mode, and supplying BYOK would not fix
their catalogue eligibility.

The SQL regression exercises the actual catalogue function: route enablement
alone still excludes a degraded capability. Activation must reconcile route,
provider, capability, effective dates, pricing, and account access together.
Catalogue corrections are a separate review artifact, not a migration in this PR.

## Adapter changes and local evidence

Vertex already maps `claude-opus-5-5` to the Anthropic publisher URL at the global
location, uses `streamRawPredict`, puts `anthropic_version=vertex-2023-10-16` in
the body, and omits the body model. The EU offer keeps its EU endpoint. This PR
preserves that contract. It fixes buffered signed thinking-block preservation
and streaming usage finalization for Opus 5.5; cache reads, writes, and output
tokens reach the pricing engine using the upstream usage counters.

Bedrock previously selected its upstream API from the incoming protocol. Opus
5.5 accepts Messages on Mantle, so incoming Chat Completions and Responses now
translate through `/anthropic/v1/messages`, with upstream model
`anthropic.claude-opus-5-5`. Other models retain their previous protocol selection.
Runtime profile IDs such as `us.anthropic.claude-opus-5-5` fail configuration
validation instead of being stripped. Unsupported Mantle regions and signing
region/hostname mismatches fail before inference; configuration is not rewritten.

Preflight rejects sampling parameters, disabled thinking, thinking token
budgets, forced tool choices, and assistant prefill for Opus 5.5. This integration
requires sampling fields to be omitted, including explicit defaults. On Bedrock
it also rejects structured-output requests and strict tools. These errors are
actionable HTTP 400 responses. Executors repeat validation before catalogue
parameter filtering, protecting direct execution paths. Requests are not
downgraded to `auto` tool choice, lower effort, or prompt-based JSON output.

Failing tests were run before fixes: 21 failures across Vertex/preflight and 13
Bedrock failures. Tests cover all three input protocols, streaming/non-streaming,
fragmented native SSE, empty and summarized thinking, signed native Messages
blocks, tool-call/result IDs, authoritative usage, cache pricing, managed key
selection, exact upstream IDs/URLs, SigV4 region, strict provider pinning, and
catalogue gates. Fixtures follow the documented provider contract; mocked
success demonstrates local translation, not provider account compatibility.
An additional four failing tests identified omitted buffered thinking summaries
on OpenAI surfaces; encoders now put that display text in reasoning fields,
separately from answer text. OpenAI wire formats do not promise replay of Anthropic's opaque signed thinking
blocks; use native Messages for signed thinking round trips.

## Account and deployment prerequisites

The primary deployed gateway has Mantle base URL
`https://bedrock-mantle.us-west-2.api.aws` and region `us-west-2`. AWS's Opus 5.5
Mantle card lists `us-east-1`, `ap-southeast-4`, and `us-gov-west-1`. A deliberate
region/residency decision and separately approved configuration change are
required. The primary and regional Workers have managed credential bindings;
secret values are not readable through Worker settings. Regional Workers have
no plain-text Bedrock region/base binding in their settings. Do not infer the
region of credentials that can themselves carry region/base overrides.

The local Vertex service-account JSON names an existing Google project. That
project has the AI Platform API enabled. Its local service account has
`roles/aiplatform.expressUser`, whose role includes
`aiplatform.endpoints.predict`. The CLI operator has project-owner access and
permission to predict and use services. This does not verify the deployed
service account or partner-model entitlement. Deployed Vertex project and
location are secret bindings; their values were not exposed or assumed equal
to local configuration. A publisher-model metadata read returned HTTP 403.
The complete quota inventory had no explicit Opus 5.5 bucket; this is not proof
of usable quota or proof of no quota. Confirm partner enablement, existing terms,
service usage permissions, model entitlement, and capacity for the deployed
identity without making an inference request.

AWS control-plane access was unavailable through the installed CLI tools. A
read-only `/v1/models` GET using the existing local Mantle token succeeded in
`us-west-2`, and did not list Opus 5.5. This is not an entitlement or inference
test. The token's identity, inference permissions, Marketplace state,
and account/model entitlement remain unverified. No inference or subscription
request was used as an access check. Use read-only model-availability and IAM
inspection with an existing authorized control-plane identity when available.

## Controlled live verification (requires approval)

1. Review and merge the adapter PR through the normal process, then separately
   approve a test deployment. Confirm the deployed credential identity, Vertex
   project and global/EU offer, Google model entitlement and quota. For Bedrock,
   confirm existing Marketplace/model access state and approve one supported
   Mantle region, keeping the route's execution/data-region metadata aligned.
   Review the staged price cards against current official pricing.
2. Approve an isolated managed-credit test workspace, maximum spend, and any
   required catalogue test activation. Keep production routes disabled until
   the approved activation step. Remove BYOK from the test workspace. An AWS
   first invocation can initiate a Marketplace subscription; approval must
   explicitly cover that possibility or confirm an existing subscription.
3. Start with Vertex: POST `/v1/chat/completions` with this body and an existing
   Phaseo key supplied privately in the Authorization header:

   ```json
   {"model":"anthropic/claude-opus-5.5","messages":[{"role":"user","content":"Reply OK."}],"max_tokens":128,"stream":false,"provider":{"only":["google-vertex"],"allow_fallbacks":false}}
   ```

   Thinking shares the output limit, so a short limit may finish with a length
   stop; do not automatically increase it. Inspect the selected provider,
   upstream path/model, key source `gateway`, token usage, reservation capture,
   request record, and prepaid debit. Stop on an access/entitlement error.
4. Only after that succeeds within the approved budget, repeat with streaming,
   then `/v1/responses` (`input` and `max_output_tokens`) and `/v1/messages`.
   Exercise a tool using `auto`, replay its tool result, and preserve signed
   thinking blocks on native Messages. Confirm terminal events, text/thinking
   separation, stop reason, cache meters where present, and exactly one managed
   charge per request. Check invalid-option requests return 400 with no upstream
   dispatch. Verify an unavailable pinned route never falls back to Anthropic.
5. Repeat that sequence for `provider.only=["amazon-bedrock"]`, checking
   `/anthropic/v1/messages`, Mantle model ID, and the explicitly approved region.
   Stop if any request indicates a different provider, model, or residency.
   Record cost/usage evidence before approving public route activation.

No credentials, terms, paid inference, route enablement, deployment, merge, or
customer contact are part of this local verification. New API model-list
discovery and stream-cancellation billing policy remain separate follow-ups.

## Official contracts

- [Vertex Opus 5.5](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/opus-5-5)
- [AWS Opus 5.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5-5.html)
- [Claude Opus 5.5 migration guide](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide)
- [AWS Messages API](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-messages-api.html)
- [AWS model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)
