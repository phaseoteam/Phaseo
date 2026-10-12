---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
"@phaseo/web": patch
---

OpenTelemetry Collector destinations can now send traces as OTLP/HTTP protobuf. Set the destination's protocol to `http/protobuf` (the default stays `http/json`), and exports, connection checks and sample traces use `application/x-protobuf`, including protobuf partial-success responses.
