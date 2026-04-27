---
"@ai-stats/sdk": patch
"@ai-stats/py-sdk": patch
"@ai-stats/go-sdk": patch
"@ai-stats/csharp-sdk": patch
"@ai-stats/java-sdk": patch
"@ai-stats/php-sdk": patch
"@ai-stats/ruby-sdk": patch
---

Separate catalog model discovery from callable SDK helper IDs.

Request-side model identifiers are now treated as runtime strings so newly released
models can be used without waiting for an SDK release. Generated helper constants
are now sourced from the current callable-on-gateway snapshot instead of the full
catalog, and SDK release automation treats model helper churn as patch-level data
updates instead of forcing minor or major version jumps.
