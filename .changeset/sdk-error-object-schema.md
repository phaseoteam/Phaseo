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

Add the `ErrorObject` model (`code`, `message`, `type`, `param`, `metadata`) and the top-level `code` field to `ErrorResponse`, matching the gateway's error body. `ErrorResponse.error` still accepts the older code string, and no existing field is renamed or removed. In every SDK except Rust, no existing type changes either.

In the Rust SDK, `ErrorResponse.error` changes from `String` to `serde_json::Value`, because a `String` cannot hold the error object; it holds either shape. Code that read `error` as a `String` should use `error.as_str()` for the old code string or `error["code"]` for the object. `PhaseoError::code` now also reads the old code string when a response has no `error.code` or top-level `code`.
