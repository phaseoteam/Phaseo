# @phaseo/agent-sdk-rust

## 0.3.0

### Minor Changes

- [#3368](https://github.com/phaseoteam/Phaseo/pull/3368) [`337499b`](https://github.com/phaseoteam/Phaseo/commit/337499ba76c0edd471fd31c2162906a1105be394) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Every SDK can now call Phaseo with a trusted workload's OIDC token instead of an API key. The Go, Java, C#, PHP, Ruby, Rust and C++ clients (and the Go, Java, C#, PHP and Rust agent SDKs) accept a credential function that is called before every request and retry, as the TypeScript and Python SDKs already do. Every SDK except C++ also includes GitHub Actions and Vercel helpers that fetch a token issued for `https://api.phaseo.app` and reuse it until a minute before it expires: `githubActionsToken()` and `vercelToken()` in TypeScript, `github_actions_token()` and `vercel_token()` in Python, and the equivalent in each language. String API keys work exactly as before.

### Patch Changes

- [#2477](https://github.com/phaseoteam/Phaseo/pull/2477) [`3ec3df2`](https://github.com/phaseoteam/Phaseo/commit/3ec3df2bd9af751a12bf89ac6bf1289a7a94f9b8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use shadcn scroll areas throughout request samples, keep managed gateway tools available in Agent SDK examples, and generate multi-turn starters from the latest user message.

## 0.2.0

### Minor Changes

- [#2419](https://github.com/phaseoteam/Phaseo/pull/2419) [`9707bde`](https://github.com/phaseoteam/Phaseo/commit/9707bded84ce41b65f3b9a4ada4b8fc8c56c4e95) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish working ESM and CommonJS entrypoints and remove the AI SDK provider's repository-only install hook. Coordinate language Agent SDK versions, core dependencies, attribution and Go module paths with the core SDK release. Keep Rust core and Agent SDKs on their pre-1.0 compatibility lines.

### Patch Changes

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Identify every official SDK and Agent SDK as its canonical technical request Source without setting App attribution.

- [#1477](https://github.com/phaseoteam/Phaseo/pull/1477) [`d7a89ff`](https://github.com/phaseoteam/Phaseo/commit/d7a89ff55d67fb8cb05ad8345fe0203c91470726) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Require explicit approval before executing approval-gated tools and reject externally supplied outputs for those calls.
