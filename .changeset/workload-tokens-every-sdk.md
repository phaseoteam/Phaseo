---
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/go-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/rust-sdk": minor
"@phaseo/cpp-sdk": minor
"@phaseo/agent-sdk-go": minor
"@phaseo/agent-sdk-java": minor
"@phaseo/agent-sdk-csharp": minor
"@phaseo/agent-sdk-php": minor
"@phaseo/agent-sdk-rust": minor
"@phaseo/agent-sdk-py": patch
"@phaseo/agent-sdk-ruby": patch
---

Every SDK can now call Phaseo with a trusted workload's OIDC token instead of an API key. The Go, Java, C#, PHP, Ruby, Rust and C++ clients (and the Go, Java, C#, PHP and Rust agent SDKs) accept a credential function that is called before every request and retry, as the TypeScript and Python SDKs already do. Every SDK except C++ also includes GitHub Actions and Vercel helpers that fetch a token issued for `https://api.phaseo.app` and reuse it until a minute before it expires: `githubActionsToken()` and `vercelToken()` in TypeScript, `github_actions_token()` and `vercel_token()` in Python, and the equivalent in each language. String API keys work exactly as before.
