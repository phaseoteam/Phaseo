---
"@phaseo/sdk": patch
"@phaseo/py-sdk": patch
"@phaseo/go-sdk": patch
"@phaseo/csharp-sdk": patch
"@phaseo/php-sdk": patch
"@phaseo/ruby-sdk": patch
"@phaseo/java-sdk": patch
"@phaseo/cpp-sdk": patch
"@phaseo/rust-sdk": patch
---

API key models (`ApiKey`, `ApiKeyWithValue` and the list, get, create and rotate responses) no longer have a `hash` field, because the management API no longer returns it. Identify keys by `id`; a hash you saved earlier is still accepted where a key id is expected.
