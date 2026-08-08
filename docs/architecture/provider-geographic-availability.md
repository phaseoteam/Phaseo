# Provider geographic availability

Last reviewed: 2026-08-07

Phaseo evaluates geographic availability separately from execution region and
data residency. Policies are inherited from a provider family and may be
overridden on a specific provider route. Request location comes from
Cloudflare's `request.cf` country and ISO 3166-2 region code; client headers and
request bodies are not trusted for this decision.

## Credit-purchase disclosure

Before a manual credit purchase, the purchaser must confirm their account
country and review the models affected by the current route policies. A model
is listed as unavailable only when every active route is blocked for that
country. Subdivision-only restrictions are displayed separately. The confirmed
country is persisted on the user account and attached to Stripe payment
metadata; Stripe Checkout also collects a full billing address for new cards.
The preview is composed by the web API. It reads a route override first, then
the provider policy stored in `v2_providers.metadata.availability`. The
catalogue importer materializes that effective policy into
`v2_model_provider_routes.metadata.availability` for database consumers.
Country-specific preview responses are publicly edge-cached for five minutes;
the authenticated country confirmation remains private and uncached.

This review is a disclosure and account-compliance signal. It does not replace
request-origin enforcement, and selecting a different country cannot make a
blocked API request routable.

## Enforced published policies

| Provider | Enforcement | Official authority |
| --- | --- | --- |
| OpenAI, including regional offers | Published country allowlist. Unknown locations fail closed. Ukraine currently fails closed because the public list says "with certain exceptions" without identifying them. | [OpenAI API supported countries and territories](https://help.openai.com/en/articles/5347006-openai-api-supported-countries-and-territories) |
| Anthropic, including US and AWS offers | Published commercial API country allowlist. Crimea, Donetsk, Kherson, Luhansk, and Zaporizhzhia are blocked; unknown Ukrainian subdivisions fail closed. | [Anthropic supported countries and regions](https://www.anthropic.com/supported-countries) |
| Google AI Studio / Gemini API | Published available-region allowlist. Unknown locations fail closed. This does not apply to Google Vertex, which has a different commercial and regional contract. | [Gemini API available regions](https://ai.google.dev/gemini-api/docs/available-regions), [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) |
| ElevenLabs | Belarus, Cuba, Iran, North Korea, Russia, Syria, Crimea, Donetsk, and Luhansk are blocked. Unknown Ukrainian subdivisions fail closed. | [ElevenLabs country restrictions](https://elevenlabs.io/docs/help-center/legal/do-you-restrict-access-to-the-service-and-platform-for-any-specific-countries) |
| Z.AI | Iran, North Korea, Cuba, Crimea, Donetsk, and Zaporizhzhia are blocked. Unknown Ukrainian subdivisions fail closed. | [Z.AI Terms of Use](https://docs.z.ai/legal-agreement/terms-of-use) |
| LongCat | Iran, North Korea, Cuba, Crimea, Donetsk, and Zaporizhzhia are blocked. Unknown Ukrainian subdivisions fail closed. | [LongCat Platform Terms](https://longcat.chat/platform/private/) |

## Providers requiring sanctions authority or contract review

The following active upstreams publish general export-control, embargo, or
sanctions obligations but do not publish a stable product country list in the
catalog-linked terms. A country-only route rule cannot satisfy denied-party,
ownership, licensed-use, or end-use screening. These providers require the
applicable signed agreement to be reviewed and a maintained sanctions-screening
authority before Phaseo can claim complete compliance:

- Amazon Bedrock, Arcee AI, Cerebras, DeepSeek, Groq, Inception, Mistral,
  Morph, Nebius, Novita, Poolside, SiliconFlow, xAI, Together, Venice,
  Voyage AI, and Weights & Biases.

The remaining active providers had no explicit geographic-access list in the
public provider terms or documentation linked by the catalogue during this
review. This is not evidence that no restriction exists: order forms, account
terms, model licences, cloud marketplace terms, and private agreements may add
requirements.

## Maintenance requirements

1. Recheck every enforced source before changing its policy and record the
   source URL in the catalogue entry.
2. Treat a removed country as an urgent fail-closed change. Additions can be
   deployed normally after verification.
3. Compare signed provider agreements and order forms with public terms.
4. Use a specialist sanctions-screening source for entities and ownership;
   IP-country routing is not a substitute for customer due diligence.
5. Keep declared account country and Stripe billing address separate from
   request-origin enforcement where a provider restricts where an API client
   may be made available.
