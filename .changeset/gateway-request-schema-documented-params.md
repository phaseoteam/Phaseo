---
"@phaseo/gateway-api": patch
---

Accept request shapes that were wrongly rejected. Chat Completions now takes assistant tool-call messages with `content: null` and `file` content parts (`file_data` or `file_id`); file parts, and Responses `input_file` parts, are sent to Claude as `document` blocks, to Gemini as inline or file data, and to OpenAI-compatible providers as `file` or `input_file`, and are left out where the upstream API has no place for them. `/v1/messages` now accepts the documented `session_id`, `reasoning` and `provider_options` fields and Anthropic's `service_tier` values `auto` and `standard_only`. Preset system prompts now reach `/v1/messages` requests without a `system` field, and Chat requests that set no `temperature` no longer send `temperature: 1` upstream, so a preset's default temperature applies.
