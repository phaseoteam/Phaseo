---
"@phaseo/gateway-api": minor
"@phaseo/docs": patch
"@phaseo/web": patch
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/go-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/cpp-sdk": minor
"@phaseo/rust-sdk": minor
---

Add a weak `ETag` (`W/"…"`) to `GET /v1/models` JSON and OpenAI-format responses and answer a matching `If-None-Match` with a body-less `304`, which saves transfer and parsing when clients poll the model list. The `ETag` ignores `gateway_region`, which is why it is weak. Each model offer now lists the `service_tiers` its provider route accepts (`flex`, `priority`, `standard`, `ultrafast`), derived from the same executable pricing the gateway uses (current, USD, with a billable meter); prices stay standard-tier.
