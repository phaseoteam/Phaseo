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

The private and public Discord webhooks are separate bindings: `DISCORD_WEBHOOK_URL` is for operator alerts and `DISCORD_WEBHOOK_NEW_MODELS_PUBLIC` is for public catalog announcements.
