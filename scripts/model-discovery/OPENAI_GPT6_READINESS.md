# OpenAI GPT-6 readiness

## Evidence

On 3 September 2026, OpenAI's public `openai-cua-sample-app` repository added
container directories named `gpt6-js-image` and `gpt6-py-image` in commit
[`4e4a6ae`](https://github.com/openai/openai-cua-sample-app/commit/4e4a6ae43e572e115ca4f7c5a5c1239f9f3aa969).
The container README also names `gpt-6-astra` as the model selected by the API
client "for projects with access." This verifies the exact model ID and
restricted availability. It does not establish pricing, limits, general public
availability, regions, or the model's full capability set.

OpenAI's [Path to Astra](https://openai.com/index/path-to-astra/) update describes
Astra as a significant increase over GPT-5.6 Sol in cybersecurity capability and
token efficiency, its most aligned model to date, and its first model to reach
the Critical cybersecurity capability threshold. This is the September 1
announcement date recorded in the catalog.

On September 3, OpenAI published the [GPT-6 Astra launch](https://openai.com/index/gpt-6-astra/)
and [API model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra).
They confirm the model ID, API rollout, pricing, limits, modalities, endpoints,
features, tools, service tiers, rate limits, and eligible Zero Data Retention.
OpenAI says API access is rolling out over the coming days.

## What is ready

- The authenticated OpenAI `/v1/models` watcher accepts model IDs without a
  GPT-version allowlist.
- A verified, routable `openai/gpt-6-astra` catalog entry records the model
  contract, public prices, and limited-access rollout status from OpenAI's documentation.
- Provider validation includes a future-major-version fixture so a later
  refactor cannot silently filter GPT-6 IDs.
- Unknown upstream IDs are included in private GitHub triage issues even though
  routine Discord alerts are restricted to known catalog models.

## Availability scope

The OpenAI provider route is enabled globally for accounts that have Astra access.
Before expanding or changing the documented contract:

1. Confirm `gpt-6-astra` through an authenticated OpenAI `/v1/models` response
   for the Phaseo account and retain the official repository and customer-story
   references as sources.
2. Verify the documented Responses, Chat Completions, and Batch contracts with
   a live API probe, including streaming, tools, structured outputs, reasoning,
   prompt caching, service tiers, and long-context billing.
3. Add OpenAI EU provider routes only where documented.
4. Run `pnpm data:prep-pr` to sync the manifest and generated SDK surfaces and
   validate catalog, pricing, gateway, and documentation data.
5. Keep authenticated smoke coverage for requests, streaming, usage accounting,
   tool calls, and error handling as OpenAI broadens the rollout.

Guesses must remain in this readiness note, not in production catalog data.
