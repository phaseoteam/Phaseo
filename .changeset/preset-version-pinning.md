---
"@phaseo/gateway-api": minor
"@phaseo/sdk": minor
---

Requests can pin a published preset version. Send `prompt.version` ("v3", "1.2.0", "2026.10.27", or a label such as "production"), or set `model` to `@slug@<ref>` or `@handle/slug@<ref>`, and the gateway runs that version's models, parameters and template instead of the current one. Named labels point at a published version, so moving a label back is a rollback. An unknown version or label returns 404 `preset_version_not_found`. Request logs record the preset version that served each request.
