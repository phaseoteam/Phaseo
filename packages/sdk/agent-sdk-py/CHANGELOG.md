# @phaseo/agent-sdk-py

## 0.3.1

### Patch Changes

- [#3704](https://github.com/phaseoteam/Phaseo/pull/3704) [`57cffbe`](https://github.com/phaseoteam/Phaseo/commit/57cffbe261e800c8681d9af93391753a680ecd6b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - `create_gateway_agent_client()` now falls back to the `PHASEO_API_KEY` environment variable when `client_options` has no `api_key`, like the other SDKs.

- [#3704](https://github.com/phaseoteam/Phaseo/pull/3704) [`57cffbe`](https://github.com/phaseoteam/Phaseo/commit/57cffbe261e800c8681d9af93391753a680ecd6b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - `run(stop_when=...)` and `continue_run(stop_when=...)` now override the agent definition's `stop_when`, as `stopWhen` does in TypeScript. Both arguments were accepted and ignored.

- [#3704](https://github.com/phaseoteam/Phaseo/pull/3704) [`57cffbe`](https://github.com/phaseoteam/Phaseo/commit/57cffbe261e800c8681d9af93391753a680ecd6b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Stop conditions now run after every step, including steps that called tools, so `stop_when` can end a run that keeps calling tools and can match on `tool_calls`. The run stops with the step's reply as its output, as in TypeScript.

- [#3704](https://github.com/phaseoteam/Phaseo/pull/3704) [`57cffbe`](https://github.com/phaseoteam/Phaseo/commit/57cffbe261e800c8681d9af93391753a680ecd6b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - A tool timeout on a tool with `on_error="return-to-model"` now goes back to the model as a tool error instead of failing the run, as in TypeScript. Python cannot stop the timed-out tool's thread; the run stops waiting for it.

- [#3368](https://github.com/phaseoteam/Phaseo/pull/3368) [`337499b`](https://github.com/phaseoteam/Phaseo/commit/337499ba76c0edd471fd31c2162906a1105be394) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Every SDK can now call Phaseo with a trusted workload's OIDC token instead of an API key. The Go, Java, C#, PHP, Ruby, Rust and C++ clients (and the Go, Java, C#, PHP and Rust agent SDKs) accept a credential function that is called before every request and retry, as the TypeScript and Python SDKs already do. Every SDK except C++ also includes GitHub Actions and Vercel helpers that fetch a token issued for `https://api.phaseo.app` and reuse it until a minute before it expires: `githubActionsToken()` and `vercelToken()` in TypeScript, `github_actions_token()` and `vercel_token()` in Python, and the equivalent in each language. String API keys work exactly as before.

## 0.3.0

### Minor Changes

- [#2419](https://github.com/phaseoteam/Phaseo/pull/2419) [`9707bde`](https://github.com/phaseoteam/Phaseo/commit/9707bded84ce41b65f3b9a4ada4b8fc8c56c4e95) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish working ESM and CommonJS entrypoints and remove the AI SDK provider's repository-only install hook. Coordinate language Agent SDK versions, core dependencies, attribution and Go module paths with the core SDK release. Keep Rust core and Agent SDKs on their pre-1.0 compatibility lines.
