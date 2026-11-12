---
"@phaseo/gateway-api": minor
"@phaseo/sdk": major
"@phaseo/py-sdk": major
"@phaseo/go-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/rust-sdk": minor
"@phaseo/cpp-sdk": minor
---

Add `GET /v1/models?format=openai` for OpenAI-compatible model discovery. Native JSON remains the default; OpenAI format returns all filtered models unless an explicit limit is supplied.

Generated TypeScript and Python model-list responses now include both native and OpenAI shapes. Typed consumers must narrow the response before accessing format-specific fields.
