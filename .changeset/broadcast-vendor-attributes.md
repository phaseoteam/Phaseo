---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
---

Broadcast traces now use the attribute names each OpenTelemetry tool's docs say it reads. Arize gets both forms of its auth headers. Respan gets indexed messages and the older token names. Langfuse gets its own input and output attributes. LangSmith gets its thread and user attributes, and PostHog gets each request's user as the distinct ID. Grafana Cloud traces opt in to Agent Observability. Every trace carries its cost in dollars as `gen_ai.usage.cost`, on the provider call that was billed. New Relic requests are split below its 1 MB limit, and Honeycomb strings are cut to 64 KB. Sample traces from the dashboard send their prompt and output as GenAI messages.
