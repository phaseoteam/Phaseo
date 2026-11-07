# @phaseo/mcp

## 0.5.0

### Minor Changes

- [#3315](https://github.com/phaseoteam/Phaseo/pull/3315) [`e40a847`](https://github.com/phaseoteam/Phaseo/commit/e40a8478475d8526e8eb69c78b0af34e7bb51a20) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Let agents manage a Phaseo account through the MCP when the user opts in. Connecting to `https://mcp.phaseo.app/mcp?access=manage` asks for account-management permissions, which the consent screen lists one by one. The MCP then adds list, create, update and delete tools for API keys (including rotate), budgets, spend rules, provider keys (BYOK), guardrails (including setting their keys), presets (including publishing a version), workspace settings, webhooks and observability destinations. Each tool needs the same OAuth scope as its Management API route and carries read-only, destructive and idempotent annotations so clients ask before changes. New API key and webhook secrets are returned once and flagged; stored credentials are never returned. The plain `/mcp` URL stays read-only.
  
  The OAuth server now accepts these management scopes from dynamically registered clients when they name them explicitly for the Phaseo MCP resource. The consent screen gains a label for spend rule permissions.

- [#2680](https://github.com/phaseoteam/Phaseo/pull/2680) [`77bf67d`](https://github.com/phaseoteam/Phaseo/commit/77bf67dc6473ce4e4b328af5329adcd936e667ce) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add an interactive model explorer with live search, model details, three-model comparisons, and token cost estimates to the Phaseo MCP.
  
  Expose global sidebar and thread entrypoints, selected model context for chat, model/comparison deep links, sorting, and a Gateway availability filter.
  
  Add local saved shortlists, integration examples, a usage dashboard, and explicitly reviewed text inference comparisons. Support optional inference OAuth consent, pinned routing, and expiring single-use quotes through the normal Gateway billing pipeline.

- [#2949](https://github.com/phaseoteam/Phaseo/pull/2949) [`9968fc1`](https://github.com/phaseoteam/Phaseo/commit/9968fc140b2191c34bac00398e70597d9728b734) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Ship the Phaseo plugin for Claude Code alongside Codex and ChatGPT. It bundles the Phaseo MCP, the Phaseo Docs MCP and all 14 public skills, with marketplaces for both hosts. Three new public skills cover migrating from eight platforms, choosing models and monitoring usage. Every public skill now has a third-person description with clear boundaries, Codex metadata (`agents/openai.yaml`) and evals, and CI validates the skills, their example model IDs and request bodies, and the plugin manifests.

### Patch Changes

- [#3482](https://github.com/phaseoteam/Phaseo/pull/3482) [`1e0ddb8`](https://github.com/phaseoteam/Phaseo/commit/1e0ddb804bbe23105f7cfa29a509fbe009e0ed1c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Factory's threads no longer load a repository's own agent settings, hooks, plugins or MCP configs (Claude, Cursor, Pi and OpenCode), failed-check logs reach agents fenced as data, and a fork's failed checks are held back. The Slack agent drops web search and web fetch when it can read the workspace's usage, posts replies without link previews, and shows saved pins and skills as people's words, not its own instructions. The Phaseo MCP marks creating keys, provider keys, webhooks and observability destinations as destructive, and the last two as reaching outside Phaseo.

- [#3466](https://github.com/phaseoteam/Phaseo/pull/3466) [`d294424`](https://github.com/phaseoteam/Phaseo/commit/d2944246402d5ffe41b2ac7ff17b99540fe655bf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare the Phaseo MCP and plugin for more agent directories: official MCP Registry entries and a publish workflow, a Cursor plugin manifest, Google Connected Apps domain verification, and tool results that repeat their structured data as JSON text for hosts that do not read `structuredContent`.

- [#3522](https://github.com/phaseoteam/Phaseo/pull/3522) [`2963b28`](https://github.com/phaseoteam/Phaseo/commit/2963b28e42b6619b82da171058487d88293a9de8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show Phaseo results inline in ChatGPT instead of opening a full-screen explorer. Model searches, cost estimates and credit balances now render as cards in the conversation, laid out like the website's model list with organisation logos and website price formatting. "Compare these" and "Open explorer" open the full explorer only when asked. The cards use the host's theme colours and system font, with no bundled font or logo, as OpenAI's app guidelines ask.

- [#3531](https://github.com/phaseoteam/Phaseo/pull/3531) [`ad3efc6`](https://github.com/phaseoteam/Phaseo/commit/ad3efc6592de4a43676f238628b23ef7824e911d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make Phaseo's cards appear inline in ChatGPT as intended. ChatGPT opened them full screen because the resource allowed both modes without saying which to prefer, and it blocked organisation logos because it still reads the legacy widget CSP key. The explorer also no longer replaces a tool's result with its own default list.

- [#3059](https://github.com/phaseoteam/Phaseo/pull/3059) [`79192f6`](https://github.com/phaseoteam/Phaseo/commit/79192f6cb007cd8b0d6673ed56fb8002070bbe29) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Get the Phaseo plugin (0.5.0) ready for the Anthropic and OpenAI plugin directories. The plugin now has a README, a 30-character short description and a support link. `build:plugin` also builds a ZIP for OpenAI's directory: it connects only the Phaseo MCP and includes five positive and three negative review cases plus release notes. `pnpm skills:validate` checks the directories' listing limits.

- [#3555](https://github.com/phaseoteam/Phaseo/pull/3555) [`361e00d`](https://github.com/phaseoteam/Phaseo/commit/361e00db77ec32bd0c6f9c47baa9637192e87cc8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Rate limit assignments no longer list `guardrail` as a `target_type`. The gateway has refused it since rate limits became rate guardrails: assign the rate limit to the keys, members or departments the guardrail covers instead. The API reference, the TypeScript, Python and Go SDKs, the CLI help and the Terraform provider now accept `key`, `member`, `department` and `end_user_default`.

- [#3394](https://github.com/phaseoteam/Phaseo/pull/3394) [`4729911`](https://github.com/phaseoteam/Phaseo/commit/47299110a98559654dfcc42bf1c75bffbe81728e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update dependencies with security fixes: undici, zod 4, the MCP TypeScript SDK, re2js, body-parser, qs, fast-uri, systeminformation and postcss-selector-parser.

## 0.4.2

### Patch Changes

- Expose each model's nullable release date through both `models_list` and `model_get`, preserving `null` when Phaseo does not know the date.

## 0.4.1

### Patch Changes

- Refresh the MCP server metadata version after expanding model results with paid-price provenance, free-provider availability, and provider-level pricing. This lets clients rediscover the updated `models_list` and `model_get` output contracts.

## 0.4.0

### Minor Changes

- [#1531](https://github.com/phaseoteam/Phaseo/pull/1531) [`89d937e`](https://github.com/phaseoteam/Phaseo/commit/89d937efad68dfdb6ccd2ce8c7482be9897eddfb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Replace the gateway models response with a Phaseo-native catalogue of lifecycle, modality, token-limit, capability, availability, pricing, and provider-offer data. Update the CLI, MCP server, OpenAPI contract, and generated SDK models for the hard cutover, add bounded and validated CIMD OAuth client discovery while retaining dynamic registration, and verify the stateless MCP 2026-07-28 transport. Improve CLI guidance with scoped command-group help, actionable unknown-command errors, a `v` version alias, published-version checks, and sanitized catalogue output.
