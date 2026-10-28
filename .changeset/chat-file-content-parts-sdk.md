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

Add the Chat `file` content part (`FileContentPart`, which needs `file_data` or `file_id`) and the `/v1/messages` `service_tier` values `auto` and `standard_only`. Chat message `content` is documented as nullable: only assistant messages that call tools may send `null`, and the TypeScript and Python types now allow it. Message and content types are otherwise unchanged in every SDK, so this is not a breaking change.
