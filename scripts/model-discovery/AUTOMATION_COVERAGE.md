# Model and pricing automation coverage

Updated: 2026-08-11

Phaseo fetches provider and aggregator sources directly. It also uses the public, provider-keyed models.dev catalogue as a lower-priority fill source for missing simple pricing; direct provider feeds and official pricing pages always take precedence.

## models.dev source parity

| models.dev adapter | Phaseo watcher | Pricing handling | Credentials |
| --- | --- | --- | --- |
| Ambient | Direct public `/v1/models` | Simple token prices auto-normalized | None |
| Anthropic | Direct `/v1/models` plus official documentation parser | Simple official token prices may update safe catalog rules | API key for model list; docs are public |
| Baseten | Direct model API | Simple token prices auto-normalized when present | API key |
| Chutes | Direct public `/v1/models` | Token prices auto-normalized | None |
| Cloudflare Workers AI | Direct account catalog with `format=openrouter` plus official pricing table | Token/audio prices auto-normalized; image tile/step rates remain review-only | Account ID and API token for catalog discovery; pricing page is public |
| CrossModel | Direct public API | Changes detected; tiered prices are review-only | Optional API key |
| DeepInfra | Direct model API | Token prices auto-normalized | Optional API key |
| DigitalOcean | Direct public GenAI catalog | Standard token prices auto-normalized; extended-context variants are review-only | None for catalog; a token is still needed for account-visible deployment state |
| EmpirioLabs | Direct public `/v1/models` | Single-tier prices auto-normalized; tier arrays are review-only | None |
| Google | Direct Gemini and Vertex model APIs | Model metadata only; official API responses do not contain authoritative prices | API key/access token |
| LLM Gateway | Direct aggregator API | Token prices auto-normalized | Optional API key |
| Mara | Direct public OpenAI-compatible `/v1/models` | Per-million token prices auto-normalized | Optional API key |
| NovitaAI | Direct public OpenAI-compatible `/models` | Per-million token prices auto-normalized, including Novita's documented integer scale | Optional API key |
| OpenAI | Direct `/v1/models` plus official documentation parser | Model API is availability-only; simple docs prices may update safe rules | API key for model list; docs are public |
| OpenRouter | Direct aggregator API | Token, cache, multimodal token, and reasoning prices auto-normalized | Optional API key |
| OrcaRouter | Direct public `/v1/models` | OpenAI-compatible token prices auto-normalized | Optional API key |
| OVHcloud AI Endpoints | Direct public catalog | Token prices auto-normalized | None |
| Pioneer | Direct public `/v1/models` | Model and price-bearing payload changes detected; no safe pricing translator yet | None |
| Poe | Direct public `/v1/models` | Simple token prices auto-normalized where provider model IDs match | Optional API key |
| Requesty | Direct public `/v1/models` | Single-tier token prices auto-normalized; prompt-threshold tiers remain review-only | Optional API key |
| FastRouter | Direct public `/api/v1/models` | Token prices auto-normalized; tiered extras remain review-only | Optional API key |
| ZenMux | Direct public `/api/v1/models` | Unconditional per-million token prices auto-normalized; conditional arrays remain review-only | Optional API key |
| Venice | Direct model API | Token prices auto-normalized | API key |
| Vercel AI Gateway | Direct public catalog | Changes detected; tiered pricing is review-only | None |
| Weights & Biases | Direct provider-owned catalog | Per-million token and cache prices auto-normalized | None |
| xAI | Direct typed model endpoints | Base token prices auto-normalized; long-context tiers are review-only | API key |

The Phaseo watcher additionally has structured official-documentation parsers for Anthropic, Cloudflare Workers AI, DeepSeek, Fireworks, Moonshot AI, StepFun, Voyage, Weights & Biases, and Xiaomi.
Official pages for ElevenLabs, Together, and xAI are not separately page-monitored because their provider `/models` APIs already expose watched pricing.

## What an automated PR is allowed to change

An automated PR may update or create pricing only when all of these are true:

- the provider model maps exactly to a canonical Phaseo model;
- the capability is known;
	- the source produces an unambiguous currency and unit, including simple per-image/character/second meters;
- the price is a simple standard, non-conditional token rate;
- an existing file has no region, context, batch, service-tier, or other conditional rules that could be flattened;
- required input and output meters are present for text generation.

Everything else remains a notification/report item. This is deliberate: a missed automatic edit is recoverable, while a confidently wrong live price is not.

## Manual pricing queue

These sources cannot currently produce a safe, complete automatic pricing PR and should be included in the manual update:

| Provider/source | Why it remains manual |
| --- | --- |
| Alibaba Cloud Model Studio | Regional CNY tables, context bands, batch discounts, and multiple product families need conditional-rule translation. |
| BytePlus ModelArk | Region, context length, batch, and cache conditions cannot be represented by the simple updater without flattening them. |
| Cerebras | The public page does not expose a stable per-model machine-readable rate table. |
| Cohere | The public page emphasizes plans and legacy/enterprise pricing rather than one authoritative current model-rate table. |
| ElevenLabs | Character, minute, credit, audio, and plan-dependent units need capability-specific meters rather than token normalization. |
| Google AI Studio / Vertex AI | Model APIs do not include pricing; the documentation has multimodal units, free/paid tiers, context bands, batch pricing, and grounding/tool charges. |
| Mistral | The current public pricing surface is not a stable API-model price table suitable for exact extraction. |
| Cloudflare Workers AI image pricing | The official page exposes image tile, megapixel, and step dimensions that cannot be flattened safely into the current per-image meter model. |
| OpenAI complex prices | The docs parser can handle straightforward token rows, but cached-write duration, audio/image/video, batch, priority, fine-tuning, tools, and other conditional prices need manual rules. |
| xAI long-context and non-token prices | Base typed-endpoint token rates are automatic; long-context, image, video, and other conditional meters remain curated. |
| CrossModel | The API exposes tiered prices; automatic flattening would be incorrect. |
| DigitalOcean extended-context variants | Standard catalog prices are automatic; context-tier variants remain manual until the PR writer emits conditional rules. |
| EmpirioLabs tier arrays | Single-tier prices are automatic; context-tier arrays are detected but not written. |
| Hugging Face Router | Pricing varies by routed inference provider and selection behavior, so one flattened price is not authoritative. |
| Vercel AI Gateway | Simple per-image/audio meters are automatic; tiered token, video-duration, and provider-specific prices remain manual. |
| Pioneer | Simple per-million token prices are automatic; model IDs not present in the canonical mapping remain unmatched. |
| ZenMux | Conditional prompt-length arrays are preserved for review rather than flattened. |
| Poe | The public feed uses bot IDs that do not always match the namespaced local model slugs; unmatched variants remain manual. |
| StepFun mappings without capabilities | The official CNY table is parsed, but a PR cannot create pricing until the provider mapping declares the applicable capability. |

EmpirioLabs and LLM Gateway are watched and can notify on upstream changes, but Phaseo does not currently have canonical API-provider directories for them. Their sync jobs therefore report unmatched providers and do not create catalog files until those integrations are added.

## Operational behavior

- The Cloudflare Worker polls provider catalogs, stores compact per-model watch snapshots instead of raw payloads, compares model metadata and price-bearing payloads, and notifies on changes; it does not dispatch the catalog sync.
- Official pricing pages are diffed line-by-line against the previous snapshot in `model_discovery_pricing_pages`; notifications list the added and removed price lines.
- Discovery run summaries persist only cross-run state (fingerprints, cursors, coverage baselines); catalog enrichment runs from live provider fetches only.
- The repository watcher keeps provider-specific source modules with `fetchModels`, `parseModels`, and a shared canonical translation stage; adding a source is a registry change rather than another endpoint switch in the runner.
- A single hourly batch run checks all configured providers; manual runs can target specific providers.
- The sync creates or updates one shared ready-for-review PR and runs data, pricing, and gateway validation before notification.
- Documentation sources are fingerprinted even when no structured parser exists, so an upstream page change is still visible in the report and notification path.
