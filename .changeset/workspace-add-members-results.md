---
"@phaseo/gateway-api": patch
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/go-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/cpp-sdk": minor
"@phaseo/rust-sdk": minor
---

`POST /v1/workspaces/{id}/members/add` now says what happened to each user. The response lists `approved`, `failed` (each with `user_id`, `code` and `message`) and `not_attempted` users. Each person is approved separately, so if one fails, everyone approved before them stays added and is recorded in the activity log, the rest aren't tried, and the response is a `409` carrying the same lists. When every user is added the response is `200`, as before. If the added members can't be read back afterwards, the outcome lists are still returned and only `data` is left out, so `data` is now optional. The SDK models include the new fields.
