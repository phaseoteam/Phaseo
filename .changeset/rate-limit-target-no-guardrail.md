---
"@phaseo/gateway-api": patch
"@phaseo/sdk": major
"@phaseo/py-sdk": major
"@phaseo/go-sdk": major
"@phaseo/cli": patch
"@phaseo/mcp": patch
"@phaseo/web": patch
---

Rate limit assignments no longer list `guardrail` as a `target_type`. The gateway has refused it since rate limits became rate guardrails: assign the rate limit to the keys, members or departments the guardrail covers instead. The API reference, the TypeScript, Python and Go SDKs, the CLI help and the Terraform provider now accept `key`, `member`, `department` and `end_user_default`.
