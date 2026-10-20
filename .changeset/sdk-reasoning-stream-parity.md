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

Add `reasoning` to `ChatMessage`, alongside `reasoning_content`, and `signature` and `format` to `ResponsesInputItem`, so reasoning items can carry a provider signature. Add the `ResponsesReasoningTextPart` model (`type: "reasoning_text"`) to `ResponsesOutputContentPart`. Nothing is renamed or removed, so this is not a breaking change.
