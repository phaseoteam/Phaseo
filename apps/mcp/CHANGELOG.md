# @phaseo/mcp

## 0.5.0

### Minor Changes

- [#2680](https://github.com/phaseoteam/Phaseo/pull/2680) [`77bf67d`](https://github.com/phaseoteam/Phaseo/commit/77bf67dc6473ce4e4b328af5329adcd936e667ce) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add an interactive model explorer with live search, model details, three-model comparisons, and token cost estimates to the Phaseo MCP.
  
  Expose global sidebar and thread entrypoints, selected model context for chat, model/comparison deep links, sorting, and a Gateway availability filter.
  
  Add local saved shortlists, integration examples, a usage dashboard, and explicitly reviewed text inference comparisons. Support optional inference OAuth consent, pinned routing, and expiring single-use quotes through the normal Gateway billing pipeline.

## 0.4.2

### Patch Changes

- Expose each model's nullable release date through both `models_list` and `model_get`, preserving `null` when Phaseo does not know the date.

## 0.4.1

### Patch Changes

- Refresh the MCP server metadata version after expanding model results with paid-price provenance, free-provider availability, and provider-level pricing. This lets clients rediscover the updated `models_list` and `model_get` output contracts.

## 0.4.0

### Minor Changes

- [#1531](https://github.com/phaseoteam/Phaseo/pull/1531) [`89d937e`](https://github.com/phaseoteam/Phaseo/commit/89d937efad68dfdb6ccd2ce8c7482be9897eddfb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Replace the gateway models response with a Phaseo-native catalogue of lifecycle, modality, token-limit, capability, availability, pricing, and provider-offer data. Update the CLI, MCP server, OpenAPI contract, and generated SDK models for the hard cutover, add bounded and validated CIMD OAuth client discovery while retaining dynamic registration, and verify the stateless MCP 2026-07-28 transport. Improve CLI guidance with scoped command-group help, actionable unknown-command errors, a `v` version alias, published-version checks, and sanitized catalogue output.
