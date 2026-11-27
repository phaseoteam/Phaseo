# Model discovery pipeline

This directory contains two notification workflows that share provider polling and Discord transport but have different audiences:

| Workflow | Source of truth | Output | Entry point |
| --- | --- | --- | --- |
| Private discovery | Provider lookups and monitoring diffs | Text-only operator alert with a review-queue link | `index.ts` → `private-model-discovery-notifications.ts` |
| Public catalog announcements | `v2_models` plus announcement state in Supabase | Public model links, OG images, and Discord embeds | `index.ts` → `public-model-catalog-announcements.ts` |

The boundaries are intentional:

- `discord-webhook.ts` only validates and sends Discord payloads. It does not know about model routes or catalog presentation.
- `private-model-discovery-notifications.ts` formats the internal review message and sends it to the private Discord and optional Slack destinations.
- `public-model-announcement-discord.ts` is the only model-discovery module that creates public model URLs, OG image URLs, and embeds.
- `public-model-catalog-announcements.ts` decides which public catalog rows are new, pending, or ready to announce.
- `helpers.ts` contains shared provider polling, diffing, pricing monitoring, and text-section helpers used by the private workflow.
- `seen-model-writes.ts` decides which `model_discovery_seen_models` rows a sweep writes (new, changed, resurfaced, or due the daily `last_seen_at` refresh), and whether a provider with a byte-identical `/models` response can reuse its stored models instead of being re-extracted.
- `venice-changelog.ts` reads Venice's API changelog (`https://docs.venice.ai/changelog.md`) as a lifecycle source, described below.
- `provider-health.ts` keeps one `model_discovery_provider_status` row per provider and sends the private failing/recovered/no-longer-checked alerts through the same private destinations.

The private and public Discord webhooks are separate bindings: `DISCORD_WEBHOOK_URL` is for operator alerts and `DISCORD_WEBHOOK_NEW_MODELS_PUBLIC` is for public catalog announcements.

An optional T3 Code webhook URL (https) also receives each private alert as JSON (`t3-webhook.ts`): `event` is `model_discovery.changes` or `model_discovery.provider_health`, with the full untruncated `text`, the alert fingerprint as `id`, the run id and source, and the structured change data as `data` (null above 200 KB). It is sent only after Discord or Slack delivered the alert, so a re-sent alert reaches it once, and it is best effort: a T3 failure is logged and never defers saving watcher state. The URL comes from the `MODEL_DISCOVERY_T3_WEBHOOK_URL` binding or, because `phaseo-gateway` is at Cloudflare's 200 text-binding limit, from the `GATEWAY_CACHE` KV key `model-discovery/t3-webhook-url/v1`. It feeds a T3 Code webhook task whose thread checks each change and updates the catalogue.

## Age and volume limits

Both workflows only announce news. A model that has been around for a while is recorded as seen but not posted:

| Setting | Default | Applies to | Rule |
| --- | --- | --- | --- |
| `MODEL_DISCOVERY_ADDED_MAX_AGE_DAYS` | 30 | Private discovery | A newly listed provider model whose `created` / `created_at` date is older than this is not reported. Models without a plausible date are always reported. |
| `PUBLIC_MODEL_ANNOUNCEMENT_MAX_AGE_DAYS` | 30 | Public announcements | A model is skipped when it was first seen more than this long ago **and** neither `released_at` nor `announced_at` falls inside the window. Models new to the catalogue are never too old. |
| `PUBLIC_MODEL_ANNOUNCEMENT_MAX_PER_RUN` | 25 | Public announcements | If one run has more fresh announcements than this, none is posted publicly: they are recorded as handled and listed in the private channel, since this pattern means a bulk catalogue edit. |

Set any of them to `0` to turn that limit off. A model skipped by either public limit is stored as `status = 'announced'` with `announced_at` null, so later runs do not pick it up again; `announced_at` is only set when a post actually went out.

## Venice changelog lifecycle source

Venice's `/models` list only shows that a model has gone, and its `created` timestamp is not the date a model was added. Venice's API changelog records each model added, deprecated (with its removal date and suggested replacement), removed, re-priced or taken off the removal schedule, by day, from 2026-10-01. `venice-changelog.ts` turns it into review signals:

- It runs with the pricing pages: on the top-of-hour scheduled sweep, on shard 0 only, and only while `PRICING_PAGE_MONITOR_ENABLED` is not `false`. No other setting controls it.
- Its state is one `model_discovery_pricing_pages` row with `provider_id = 'venice-changelog'`. `fingerprint` hashes the parsed model entries (so edits to the monthly API prose do not count), and `content_lines` holds the key of every entry seen. A matching fingerprint skips the route lookup.
- Each new entry is matched on `provider_model_slug` to `venice` and `venice-e2ee` routes in `v2_model_provider_routes`, and the private alert says what each route needs: an `effective_to` for a deprecation, retirement for a removal, a check of pricing for a price change, a review of `effective_to` for a cancelled removal, or onboarding for an addition with no route. A deprecation that was later cancelled, re-dated or followed by the removal asks for nothing, and neither does a deprecation or removal followed by Venice adding the model again (a cancelled removal still asks for an end-date review).
- With no stored row, the first run reports only deprecations, removals and cancelled removals whose action is still open on a route; it does not replay the whole history.
- Its lines go out as separate private messages after the main alert, split on lines (an over-long line wraps onto continuation lines) and never capped or truncated, so every entry saved as seen was named in a delivered message. At least one destination (Discord or Slack) must receive every part; otherwise the run defers saving and the entries are reported again.
- The main alert is split the same way, so a change past the first 1,900 characters is still delivered before its pricing-page state is saved. The duplicate-alert fingerprint hashes the full alert content plus the Venice lines.
- It never writes routes, prices or end dates. Like pricing-page state, the row is saved only after the alert is delivered.
