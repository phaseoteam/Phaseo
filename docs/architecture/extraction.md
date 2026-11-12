# Extraction capability workshop

Status: initial proposal, 2026-10-19. The scalar preview is implemented in this
branch; see [implementation and validation](extraction-implementation.md). The
proposal below records the original design choices, including deferred features.

## Recommendation

Add `extraction.extract`, exposed as `POST /v1/extractions`, with dedicated
`IRExtractionRequest` and `IRExtractionResponse` types. Run it through the existing
gateway lifecycle. This is a new operation and typed contract, not a new pipeline
system. Names and shapes below are proposals, not supported API promises.

Decisions choose among supplied alternatives; extraction returns values whose
domain cannot be enumerated in advance. Adding numbers, dates, spans and forecast
distributions to `IRDecisionQuestion` would blur that boundary and weaken response
validation. Do not route extraction through chat or silently substitute an LLM.

## Existing implementation to follow

- `apps/api/src/routes/v1/data/decisions.ts`: endpoint handler and schema.
- `apps/api/src/protocols/decisions/{decode,encode}.ts`: public protocol boundary.
- `apps/api/src/core/ir.ts`: dedicated decisions request/response and shared `IRUsage`.
- `apps/api/src/pipeline/surfaces/decisions.ts`: decode, execute and finalize.
- `apps/api/src/pipeline/execute/index.ts`: capability routing, reservations,
  provider selection and non-streaming timing. Some handling explicitly names
  decisions; extraction must be audited through those branches.
- `apps/api/src/executors/cloudflare/shared.ts`: authenticated Workers AI transport,
  timing and Cloudflare envelope unwrapping.
- `apps/api/src/executors/cloudflare/decisions/index.ts`: provider limits and media
  validation. Its model allowlist excludes Clairic, correctly.
- `apps/api/src/executors/_shared/decisions/systemone.ts`: bounded response reading,
  answer validation and usage mapping. Reuse the pattern; its question/answer
  semantics are specific to decisions.
- `apps/api/src/pipeline/after/payload.ts`: public payload and pricing assembly.
- `apps/docs/openapi/v1/openapi.yaml`, TS `src/index.ts` decisions resource and Python
  sync/async decisions resources: contract and client propagation points.

Reuse authentication, workspace policy, model resolution, routing, key selection,
error normalization, reservation/settlement, audit and pricing. Add the endpoint,
capability registrations, schemas, protocol pair, IR pair, surface and Cloudflare
extraction executor. Extract small shared helpers only where both implementations
actually need them; avoid a generic System One framework.

## Proposed public contract

Use `input` as the canonical source string and a keyed `fields` map. Keeping input
as one exact string makes span provenance unambiguous. Inline images are separate;
do not introduce chat messages or serialize objects implicitly.

```json
{
  "model": "cloudflare/clairic",
  "input": "Invoice INV-2291: 4 pallets at $250 each, shipping $80.",
  "fields": {
    "invoice_number": { "type": "text" },
    "total": {
      "type": "number", "decimals": 2, "unit": "USD",
      "instructions": "Amount due including shipping"
    },
    "purchase_order": { "type": "text", "instructions": "Purchase order number" }
  },
  "reference_date": "2026-10-19"
}
```

`cloudflare/clairic` is a suggested canonical ID, pending catalogue convention
review. Illustrative response, with invented confidence values:

```json
{
  "model": "cloudflare/clairic",
  "answers": {
    "invoice_number": {
      "type": "text", "value": "INV-2291", "span": [8, 16],
      "confidence": 0.99, "p_null": 0.001
    },
    "total": { "type": "number", "value": 1080, "confidence": 0.98, "p_null": 0.002 },
    "purchase_order": { "type": "text", "value": null, "confidence": 0.99, "p_null": 0.99 }
  },
  "truncated": false,
  "usage": { "input_tokens": 655, "output_tokens": 0, "total_tokens": 655 }
}
```

The usage above illustrates a provider aggregate, not a tokenizer prediction for
this example. Standard gateway request IDs, pricing and debug metadata follow
existing conventions; final envelope details need a payload-layer review.

Request field specs should be strict discriminated unions covering `text`,
`number`, `date`, `time`, `datetime`, `duration`, `list`, `estimate` and `forecast`.
Dates/times must validate semantically, not just match a string pattern. Lists are
typed scalar lists, not arbitrary nested JSON Schema. Number precision, duration
units, estimate bounds/grid/scale and forecast horizons require explicit validation.
Do not advertise JSON Schema compatibility.

## Internal representation

Sketch only; production types must expand every field and answer variant into
strict unions rather than `Record<string, any>`.

```ts
type IRExtractionRequest = {
  model: string;
  sourceText: string; // preserved byte-for-byte; no trimming or injected prompts
  fields: Record<string, IRExtractionField>;
  images?: Array<{ contentType: "image/png" | "image/jpeg" | "image/webp"; base64: string }>;
  referenceDate?: string;
  includeQuantiles?: boolean;
};

type IRExtractionResponse = {
  model: string;
  answers: Record<string, IRExtractionAnswer>;
  truncated: boolean;
  usage: IRUsage;
  extractionUsage?: {
    stateTokens?: number;
    schemaTokens?: number;
    imageTokens?: number;
    passes?: number;
  };
};
```

Attach raw request/response only through established internal diagnostic handling.
Never make provider payloads necessary to interpret canonical answers.

## Cloudflare adapter

Map `sourceText` to `state`, preserve field keys/specs, map `referenceDate` to
`reference_date` and quantile selection to `options.include_quantiles`. Send
`model: "clairic"` to `/ai/run/@cf/cloudflare/clairic`. Resolve the upstream slug
through model routing; do not hardcode public model IDs into shared layers.

Reuse `runCloudflareModel` and `unwrapCloudflareResult`; validate both HTTP failures
and Cloudflare failure envelopes. Validate answers against the requested fields,
including missing/extra keys, type, finite values, probability bounds, valid dates,
list item types, ordered quantiles and span bounds. A malformed success is a safe
502, not a successful empty extraction. Bound response bytes independently of
request bytes, particularly for lists and quantiles.

Clairic documents four embedded PNG/JPEG/WebP images, 4 MiB per image, 8 MiB combined
decoded and a 16 MiB request body. Remote image URLs are not accepted upstream.
Initially accept embedded images only, with limits enforced before upstream I/O.
Audio/video, PDF ingestion, URL fetching and document OCR orchestration are out of
scope. Image-only requests need explicit validation; text spans cannot pretend to
reference an image.

## Uncertainty and provenance

- Preserve `value: null` as an unavailable value. It is distinct from a provider
  error, refusal, empty list and numerical zero.
- Keep `p_null` separate from confidence. Do not infer one as `1 -` the other or
  apply a gateway confidence threshold that changes answers.
- Estimates/forecasts preserve median, p10/p90, and supported optional quantiles
  and tail probabilities. Do not invent confidence/p_null when absent.
- Omit provider `guess` initially: a non-null guess accompanying a null value is
  easy to misuse. Preserve it only in authorized raw diagnostics.
- Exact span offsets must refer to the unmodified source. Confirm Cloudflare's
  Unicode indexing and end-boundary convention before promising public offsets;
  use emoji, combining characters and non-Latin fixtures. Likewise verify whether
  returned `state_text` changes the reference frame when `truncated` is true.
  Do not expose ambiguous spans. Prefer rejecting over-limit requests until that
  behavior is verified; surface any unexpected provider truncation explicitly.
- Confidence is model-reported evidence, not a gateway guarantee of accuracy.

## Usage and billing

Cloudflare advertises $0.10 per million input tokens, with no output charge.
The provider example reports state/image/schema counts, aggregate input tokens,
zero output tokens and multiple passes. Set shared `IRUsage.inputTokens` from
validated aggregate `usage.input_tokens`; output is zero and total equals input.
Never reconstruct the aggregate by summing component counts or multiplying by
passes. Retain components/passes as diagnostics; bill aggregate input once.

Do not reuse the existing decisions reservation estimator: it models questions and
can require an output budget. Add extraction-aware money and provider-rate-limit
reservation handling that accounts for repeated source processing. Cloudflare
describes 8,192-token passes while listing a 65,536-token model context; confirm
long-source segmentation and a conservative billable upper bound before enabling
requests. Until then, pick documented bounded limits or keep execution disabled;
do not guess a reservation from source tokens alone. Missing/invalid usage needs
an explicit reconciliation policy rather than treating successful inference as
free. Cover consumed usage on malformed responses and retries in settlement tests.

Catalogue capability, route and token pricing records belong in the database;
archived JSON fixtures are not the source of truth. This workshop makes no database
changes and does not establish Phaseo's customer price or markup.

## Initial delivery and proof

First ship one synchronous JSON endpoint, one Cloudflare executor and explicit
capability checks. Stage scalar extraction and inline images first; estimates and
forecasts can follow as separately gated field support after their raw schemas
and validation rules are pinned. Unsupported field types must fail before billing.
No streaming, async jobs, automatic model substitutions or chat emulation.

Implementation should update OpenAPI first, regenerate clients, and expose
`client.extractions.create(...)` in TS and Python sync/async clients. Audit model
discovery filters, executor unions/registries, policy allowlists, token reservations,
usage/pricing assembly, analytics and audit labels for the new capability. Add a
changeset when shipping; database schema changes, if needed, follow the declarative
workflow rather than editing migrations.

Proof should include protocol/executor fixtures, a local AIMock request/response,
missing and invalid values, Unicode spans, truncation, image/body limits, provider
envelopes, malformed usage, multi-pass accounting, retries and reservation release.
Run scoped API lint/tests/build, OpenAPI lint/check/generation and SDK compatibility
tests. No paid live call is necessary for the workshop.

## Choices to settle

1. Keep extraction separate from decisions (recommended), or broaden decisions
   into a more general typed inference operation? Existing decisions compatibility
   favors keeping its contract stable.
2. Use Phaseo's `input` naming (recommended) or mirror Cloudflare's `state` exactly?
   Keep a single public spelling for this new surface.
3. Begin with scalar extraction (recommended) or include estimation/forecasting in
   the first release? The latter increases distribution validation and support scope.
4. How should public spans represent Unicode and truncated source provenance?
   Provider behavior needs verification before choosing a permanent contract.

## Evidence and verification

Official pages retrieved with `curl.exe` on 2026-10-19; the web reader returned
inaccessible errors. The announcement explicitly calls this a preview and lists
arithmetic, forecasting, calibration and confidence limitations.

- [Clairic announcement](https://developers.cloudflare.com/changelog/post/2026-10-19-clairic-workers-ai/)
- [Clairic model, request/response and limits](https://developers.cloudflare.com/workers-ai/models/clairic/)

Repository evidence is static inspection of the files listed above. No provider
inference, live catalogue query, runtime test, SDK generation or deployment was
performed. This document is an architecture proposal, not verified API behavior.
