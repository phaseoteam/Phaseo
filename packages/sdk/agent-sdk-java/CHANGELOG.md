# @phaseo/agent-sdk-java

## 0.4.0

### Minor Changes

- [#3368](https://github.com/phaseoteam/Phaseo/pull/3368) [`337499b`](https://github.com/phaseoteam/Phaseo/commit/337499ba76c0edd471fd31c2162906a1105be394) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Every SDK can now call Phaseo with a trusted workload's OIDC token instead of an API key. The Go, Java, C#, PHP, Ruby, Rust and C++ clients (and the Go, Java, C#, PHP and Rust agent SDKs) accept a credential function that is called before every request and retry, as the TypeScript and Python SDKs already do. Every SDK except C++ also includes GitHub Actions and Vercel helpers that fetch a token issued for `https://api.phaseo.app` and reuse it until a minute before it expires: `githubActionsToken()` and `vercelToken()` in TypeScript, `github_actions_token()` and `vercel_token()` in Python, and the equivalent in each language. String API keys work exactly as before.

### Patch Changes

- [#2711](https://github.com/phaseoteam/Phaseo/pull/2711) [`2a84658`](https://github.com/phaseoteam/Phaseo/commit/2a84658993c7477296c1ac4461d59044d3c732dc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update vulnerable runtime and tooling dependencies to patched releases, including Hono, Electron, Jackson, Guzzle, and shared dependency overrides.

## 0.3.0

### Minor Changes

- [#2419](https://github.com/phaseoteam/Phaseo/pull/2419) [`9707bde`](https://github.com/phaseoteam/Phaseo/commit/9707bded84ce41b65f3b9a4ada4b8fc8c56c4e95) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish working ESM and CommonJS entrypoints and remove the AI SDK provider's repository-only install hook. Coordinate language Agent SDK versions, core dependencies, attribution and Go module paths with the core SDK release. Keep Rust core and Agent SDKs on their pre-1.0 compatibility lines.
