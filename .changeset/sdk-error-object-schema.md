---
"@phaseo/sdk": patch
"@phaseo/py-sdk": patch
"@phaseo/go-sdk": patch
"@phaseo/csharp-sdk": patch
"@phaseo/java-sdk": patch
"@phaseo/php-sdk": patch
"@phaseo/ruby-sdk": patch
"@phaseo/rust-sdk": patch
"@phaseo/cpp-sdk": patch
---

Add the `ErrorObject` model (`code`, `message`, `type`, `param`, `metadata`) and the top-level `code` field to `ErrorResponse`, matching the gateway's error body. `ErrorResponse.error` still accepts the older code string, and no existing type or field is renamed or removed, so this is not a breaking change.
