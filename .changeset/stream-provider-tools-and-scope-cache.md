---
"@phaseo/gateway-api": patch
---

Enable incremental tool arguments for supported Vertex Gemini models and eager tool streaming for Claude on Anthropic, Vertex, and Bedrock, excluding Bedrock Sonnet 4.5. Handle Gemini typed argument fragments and Interactions argument events, preserve call IDs and signatures, and fail incomplete calls without reporting successful completion. Supply opaque workspace-scoped prompt cache keys for OpenAI and Mistral while preserving explicit BYOK keys. Preserve native Anthropic automatic cache control and its breakpoint budget without changing provider_options cache placement.
