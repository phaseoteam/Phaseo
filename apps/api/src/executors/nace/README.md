# Nace decision IR

The shared `IRDecisionsRequest` and `IRDecisionsResponse` in `src/core/ir.ts`
represent decision evaluation separately from chat. The pure codec in
`src/executors/nace/decision-codec.ts` preserves `noul` probabilities,
choice distributions, confidence, fractional
scores, JSON state, request identity, timing and usage. It accepts the four
documented current pinned models and rejects implicit aliases or substitutions.

Image input supports inline PNG/JPEG/WebP base64 on Drex Max. Remote URLs and
Nace workspace references require an upload integration and are not accepted by
this codec. Token limits require upstream tokenization; the codec enforces the
documented body, question and Max option counts locally. Image token counts are
already included in input tokens and must not be added again. Output tokens are
preserved for reporting; Nace lists their billing rate as zero.

This is the IR and translation layer. No public endpoint, executor registration,
credentials, billing SKU, or enabled route is added. Serving decisions requires
connecting a dedicated decision surface to the common auth, policy, routing,
reservation and settlement pipeline. Perception document jobs need a separate
document contract and asynchronous lifecycle.

Official evidence, checked 2026-10-19:

- https://console.nace.ai/docs/drex/reference/models
- https://console.nace.ai/docs/drex/guides/questions
- https://console.nace.ai/docs/drex/guides/reading-answers
- https://console.nace.ai/docs/drex/guides/drex-max
- https://console.nace.ai/docs/drex/reference/pricing

Official logo assets are copied without modification from
https://www.nace.ai/nace-logo-black.svg and
https://www.nace.ai/nace-logo-white.svg into the web logo directory as
`nace_light.svg` and `nace_dark.svg` respectively.
