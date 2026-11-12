---
"@phaseo/cpp-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/gateway-api": minor
"@phaseo/go-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/rust-sdk": minor
"@phaseo/sdk": minor
"@phaseo/cli": patch
"@phaseo/docs": patch
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Add beta management endpoints for request classifiers (`/v1/classifiers`), with new `classifiers:read`, `classifiers:write`, and `classifiers:delete` scopes. A classifier is a workspace taxonomy of up to 12 dimensions, a model, optional instructions, a sample rate, an optional scope (keys, apps, models), and an optional monthly budget; up to 5 per workspace. The gateway does not run classifiers yet.
