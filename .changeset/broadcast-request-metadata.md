---
"@phaseo/gateway-api": minor
---

Broadcast exports the request body's `metadata` as `phaseo.metadata.<key>` span attributes, under each destination's request context setting. `trace_name`, `span_name` and `generation_name` rename the exported spans, and `trace_id` (with an optional `parent_span_id`) groups requests into one trace when no `traceparent` header is sent.
