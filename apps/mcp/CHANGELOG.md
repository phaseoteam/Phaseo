# @phaseo/mcp

## 0.5.0

### Minor Changes

- [#2680](https://github.com/phaseoteam/Phaseo/pull/2680) [`77bf67d`](https://github.com/phaseoteam/Phaseo/commit/77bf67dc6473ce4e4b328af5329adcd936e667ce) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add an interactive model explorer with live search, model details, three-model comparisons, and token cost estimates to the Phaseo MCP.
  
  Expose global sidebar and thread entrypoints, selected model context for chat, model/comparison deep links, sorting, and a Gateway availability filter.
  
  Add local saved shortlists, integration examples, a usage dashboard, and explicitly reviewed text inference comparisons. Support optional inference OAuth consent, pinned routing, and expiring single-use quotes through the normal Gateway billing pipeline.

- [#2949](https://github.com/phaseoteam/Phaseo/pull/2949) [`9968fc1`](https://github.com/phaseoteam/Phaseo/commit/9968fc140b2191c34bac00398e70597d9728b734) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Ship the Phaseo plugin for Claude Code alongside Codex and ChatGPT. It bundles the Phaseo MCP, the Phaseo Docs MCP and all 14 public skills, with marketplaces for both hosts. Three new public skills cover migrating from eight platforms, choosing models and monitoring usage. Every public skill now has a third-person description with clear boundaries, Codex metadata (`agents/openai.yaml`) and evals, and CI validates the skills, their example model IDs and request bodies, and the plugin manifests.

### Patch Changes

- [#3059](https://github.com/phaseoteam/Phaseo/pull/3059) [`79192f6`](https://github.com/phaseoteam/Phaseo/commit/79192f6cb007cd8b0d6673ed56fb8002070bbe29) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Get the Phaseo plugin (0.5.0) ready for the Anthropic and OpenAI plugin directories. The plugin now has a README, a 30-character short description and a support link. `build:plugin` also builds a ZIP for OpenAI's directory: it connects only the Phaseo MCP and includes five positive and three negative review cases plus release notes. `pnpm skills:validate` checks the directories' listing limits.

## 0.4.2

### Patch Changes

- Expose each model's nullable release date through both `models_list` and `model_get`, preserving `null` when Phaseo does not know the date.

## 0.4.1

### Patch Changes

- Refresh the MCP server metadata version after expanding model results with paid-price provenance, free-provider availability, and provider-level pricing. This lets clients rediscover the updated `models_list` and `model_get` output contracts.

## 0.4.0

### Minor Changes

- [#1531](https://github.com/phaseoteam/Phaseo/pull/1531) [`89d937e`](https://github.com/phaseoteam/Phaseo/commit/89d937efad68dfdb6ccd2ce8c7482be9897eddfb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Replace the gateway models response with a Phaseo-native catalogue of lifecycle, modality, token-limit, capability, availability, pricing, and provider-offer data. Update the CLI, MCP server, OpenAPI contract, and generated SDK models for the hard cutover, add bounded and validated CIMD OAuth client discovery while retaining dynamic registration, and verify the stateless MCP 2026-07-28 transport. Improve CLI guidance with scoped command-group help, actionable unknown-command errors, a `v` version alias, published-version checks, and sanitized catalogue output.
