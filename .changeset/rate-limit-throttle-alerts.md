---
"@phaseo/cpp-sdk": patch
"@phaseo/csharp-sdk": patch
"@phaseo/docs": patch
"@phaseo/gateway-api": patch
"@phaseo/go-sdk": patch
"@phaseo/java-sdk": patch
"@phaseo/php-sdk": patch
"@phaseo/py-sdk": patch
"@phaseo/ruby-sdk": patch
"@phaseo/rust-sdk": patch
"@phaseo/sdk": patch
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Add the `rate_limit_throttled` notification event. Workspaces that route it to a destination get at most one alert an hour when rate limit policies reject requests, with the total over the last 15 minutes and the most-rejected policies.
