---
name: phaseo-async-webhooks
description: "Builds Phaseo async video, batch and webhook integrations: creating jobs and persisting their IDs, polling or websocket status helpers, idempotent webhook consumers for the standard payload, and recovery when local state and the gateway disagree. Use when a project generates video, submits batches, receives Phaseo webhooks or has stuck long-running jobs. Not for synchronous text, image or audio requests (use phaseo-gateway or an SDK skill)."
license: MIT
---

# Phaseo Async Jobs and Webhooks

Use this skill when one integration needs to handle video or batch jobs as long-running work instead of assuming immediate completion.

## Outcome
Deliver a working async integration that:
- creates video or batch jobs through the gateway or official SDKs
- persists the returned job id immediately
- polls or subscribes safely until terminal state
- treats webhook deliveries as idempotent notifications, not the only source of truth
- keeps enough lifecycle metadata for operations to separate generation failures from delivery failures

## Workflow
1. Create the async job and persist the returned id immediately.
2. If the SDK is already present, prefer the existing helper:
- TypeScript: `client.generateVideo(...)`, `client.videos.get(...)`, `client.videos.websocketUrl(...)`, `client.batches.create(...)`
- Python: `client.generate_video(...)`, `client.videos.get(...)`, `client.videos.websocket_url(...)`, `client.batches.create(...)`
3. If webhooks are enabled, still keep a polling or websocket recovery loop. Webhooks are notifications, not a substitute for authoritative status reads.
4. Persist and inspect the normalized async fields that the gateway exposes:
- native `status`
- normalized `lifecycle_status`
- `polling_url`
- `cancel_url` when present
- webhook delivery summary and recent attempts when available
5. Design webhook consumers to be:
- signature-aware
- idempotent
- tolerant of retries and out-of-order deliveries
6. When local state and webhook payload disagree, fetch the latest job status before mutating durable application state.

## Rules

- Never assume async completion from the create response.
- Store the job id before doing any downstream work.
- Treat `completed`, `failed`, `cancelled`, and `expired` as terminal states.
- Separate job execution telemetry from webhook delivery telemetry in your logs and dashboards.
- Prefer one shared retry policy for polling rather than unbounded tight loops.
- If one workflow only needs download access after completion, keep the content-fetch path separate from the status loop.

## Use this skill for

- async video generation with webhook callbacks
- async batch creation with lifecycle polling
- webhook signature verification and replay-safe consumers
- internal workers that need to resume tracking long-running gateway jobs
- dashboard or operational surfaces that need normalized lifecycle fields

## Validation

- one deterministic create-and-track path on the async surface you changed
- one check that job ids are stored and reused instead of recreated
- one webhook or status-recovery check that proves the integration does not rely on a single delivery attempt
