# Provider stream cancellation and billing audit

Date: 2026-07-23

## Decision

Provider cancellation support and customer billing settlement are separate capabilities.
Phaseo cancels an upstream stream only when both are true:

1. the provider is known to stop processing and provider billing on disconnect; and
2. Phaseo can recover authoritative usage after that cancellation.

Until both are verified, the gateway drains the upstream stream after a downstream
disconnect. Unknown behavior is never treated as cancellation support.

The current published evidence is OpenRouter's stream cancellation matrix:
https://openrouter.ai/docs/api/reference/streaming

This is aggregator evidence, not a direct provider contract. It establishes an
initial classification but does not establish that a direct Phaseo integration
receives an exact terminal usage record after cancellation.

## Catalogue coverage

All 93 current Phaseo API-provider records resolve to a policy. The classification
below maps regional and hosted variants to their underlying execution provider.

### Reported supported (19)

OpenRouter reports that cancellation stops processing and provider billing:

- anthropic
- anthropic-us
- avian
- azure
- chutes
- cloudflare
- cohere
- deepinfra
- deepseek
- fireworks
- friendli
- hyperbolic
- infermatic
- liquid-ai
- mancer
- novita
- openai
- openai-eu
- together

Gateway action today: `drain_upstream`, because exact post-cancellation usage
recovery has not yet been verified for the direct integrations.

### Reported unsupported (20)

- ai21
- aion-labs
- alibaba-cloud
- amazon-bedrock
- anthropic-aws
- anthropic-aws-us
- featherless
- google-ai-studio
- google-vertex
- google-vertex-eu
- groq
- inference-net
- inflection
- minimax
- minimax-lightning
- mistral
- nebius-token-factory
- nebius-token-factory-fast
- perplexity
- sambanova

Gateway action: `drain_upstream`.

### No defensible published evidence found in the initial matrix (54)

- akashml
- ambient
- arcee-ai
- atlascloud
- baidu
- baseten
- black-forest-labs
- byteplus
- canopy-wave
- cerebras
- clarifai
- crofai
- crusoe
- darkbloom
- digitalocean
- elevenlabs
- gmicloud
- inception
- inceptron
- ionrouter
- longcat
- mara
- meta
- moonshotai
- moonshotai-turbo
- morph
- nextbit
- nousresearch
- nvidia
- ovhcloud
- parasail
- phala
- poolside
- reka
- relace
- sakana
- scaleway
- siliconflow
- sourceful
- spacex-ai
- stepfun
- streamlake
- suno
- switchpoint
- tensorix
- thinking-machines
- upstage
- venice
- venice-e2ee
- voyage
- wafer
- weights-and-biases
- xiaomi
- z-ai

Gateway action: `drain_upstream`. Each provider stays unknown until its direct API
contract or an integration test proves cancellation and billing behavior.

## Why `waitUntil()` is not a billing authority

An HTTP Worker can continue for only 30 seconds after the client disconnects.
Reasoning streams may run for minutes, so terminal usage and the final charge cannot
depend solely on the original HTTP invocation.

The durable billing design is:

1. Create an idempotent charge intent and reserve a conservative maximum amount
   before the first upstream request.
2. Include the selected provider, provider request identifier, pricing snapshot,
   and cancellation policy in that intent.
3. Stream normally while accumulating safe usage counters.
4. On completion, enqueue an idempotent settlement carrying authoritative usage.
5. On client disconnect:
   - cancel only when cancellation stops provider billing and exact usage is
     recoverable;
   - otherwise continue draining while the Worker is alive.
6. Never release a reservation because the client disconnected.
7. Reconcile incomplete intents from provider usage/invoice APIs where available.
8. Keep an unresolved reservation for manual/provider reconciliation when exact
   usage is unavailable; do not silently mark it free.

Queues make settlement delivery durable, but they cannot recover terminal usage
that a canceled or expired Worker never observed. The pre-dispatch reservation is
therefore the universal financial backstop.

## Activation requirement for `cancel_upstream`

For each provider, add direct evidence for:

- cancellation transport (`AbortSignal`, HTTP disconnect, cancel endpoint);
- whether processing and provider billing stop;
- how exact usage is obtained after cancellation;
- whether reasoning tokens are included;
- provider request ID availability before the stream ends;
- test date, API version, and source URL.

Only then change `usageRecovery` to `authoritative`; the gateway policy will permit
`cancel_upstream` only for that combination.
