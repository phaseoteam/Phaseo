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
- `provider-health.ts` keeps one `model_discovery_provider_status` row per provider and sends the private failing/recovered/no-longer-checked alerts through the same private destinations.

The private and public Discord webhooks are separate bindings: `DISCORD_WEBHOOK_URL` is for operator alerts and `DISCORD_WEBHOOK_NEW_MODELS_PUBLIC` is for public catalog announcements.

## Age and volume limits

Both workflows only announce news. A model that has been around for a while is recorded as seen but not posted:

| Setting | Default | Applies to | Rule |
| --- | --- | --- | --- |
| `MODEL_DISCOVERY_ADDED_MAX_AGE_DAYS` | 30 | Private discovery | A newly listed provider model whose `created` / `created_at` date is older than this is not reported. Models without a plausible date are always reported. |
| `PUBLIC_MODEL_ANNOUNCEMENT_MAX_AGE_DAYS` | 30 | Public announcements | A model is skipped when it was first seen more than this long ago **and** neither `released_at` nor `announced_at` falls inside the window. Models new to the catalogue are never too old. |
| `PUBLIC_MODEL_ANNOUNCEMENT_MAX_PER_RUN` | 25 | Public announcements | If one run has more fresh announcements than this, none is posted publicly: they are recorded as handled and listed in the private channel, since this pattern means a bulk catalogue edit. |

Set any of them to `0` to turn that limit off. A model skipped by either public limit is stored as `status = 'announced'` with `announced_at` null, so later runs do not pick it up again; `announced_at` is only set when a post actually went out.
