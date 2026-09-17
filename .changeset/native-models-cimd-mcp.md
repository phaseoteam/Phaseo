---
"@phaseo/gateway-api": major
"@phaseo/sdk": major
"@phaseo/py-sdk": major
"@phaseo/go-sdk": major
"@phaseo/csharp-sdk": major
"@phaseo/java-sdk": major
"@phaseo/php-sdk": major
"@phaseo/ruby-sdk": major
"@phaseo/cpp-sdk": major
"@phaseo/rust-sdk": minor
"@phaseo/mcp": minor
---

Replace the gateway models response with a Phaseo-native catalogue of lifecycle, modality, token-limit, capability, availability, pricing, and provider-offer data. Update the CLI, MCP server, OpenAPI contract, and generated SDK models for the hard cutover, add bounded and validated CIMD OAuth client discovery while retaining dynamic registration, and verify the stateless MCP 2026-07-28 transport. Improve CLI guidance with scoped command-group help, actionable unknown-command errors, a `v` version alias, published-version checks, and sanitized catalogue output.
