---
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/go-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/rust-sdk": minor
"@phaseo/cpp-sdk": minor
---

Add `reasoning` to `ChatMessage`, alongside `reasoning_content`, and `signature` and `format` to `ResponsesInputItem`, so reasoning items can carry a provider signature. Add the `ResponsesReasoningTextPart` model (`type: "reasoning_text"`) as a new member of the `ResponsesOutputContentPart` union.

No SDK field or type is renamed or removed, but the API now returns reasoning text in Responses `reasoning` items as `reasoning_text` parts instead of `output_text` parts. Code that picks reasoning text by checking for an `output_text` part, or that handles every `ResponsesOutputContentPart` as `output_text`, should also handle `ResponsesReasoningTextPart`; the text is still in `text`.
