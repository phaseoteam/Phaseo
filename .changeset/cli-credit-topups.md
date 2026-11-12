---
"@phaseo/gateway-api": minor
"@phaseo/cli": minor
"@phaseo/web": minor
"@phaseo/docs": patch
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/go-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/cpp-sdk": minor
"@phaseo/rust-sdk": minor
---

Add human-confirmed credit top-ups for agents. `POST /v1/credits/topups` (beta) starts a $5 to $500 top-up and `GET /v1/credits/topups/{id}` reports its status, with a `final` flag and a `reason` code for declined, expired and failed top-ups. Nothing is charged by the API: with a saved card, every workspace owner and admin is emailed a single-use link to a review page where one of them confirms (with 3D Secure when the bank asks) or declines; without one, the response has a link where an owner or admin pays with a new card through the existing checkout, which saves it for later top-ups. Requests expire after 30 minutes and a workspace can have 5 pending. The new `billing:write` scope is opt-in: it is not a default CLI login scope or management-key scope. The CLI adds `phaseo credits add --amount <usd>` and `phaseo credits topups get <id>`, and `phaseo login --scopes billing:write` keeps the default scopes and adds it.
