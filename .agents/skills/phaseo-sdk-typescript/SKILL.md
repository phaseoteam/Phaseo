---
name: phaseo-sdk-typescript
description: "Builds Phaseo integrations with the official TypeScript and JavaScript SDK, `@phaseo/sdk`: one shared client, `generateResponse` and streaming, images, audio, async video, presets, model discovery and request IDs for debugging. Use when a project depends on or should adopt `@phaseo/sdk` in Node.js, Bun or edge runtimes. Not for agent loops (use phaseo-agent-sdk-typescript), Python (phaseo-sdk-python) or code that keeps the OpenAI SDK with a swapped base URL (phaseo-gateway)."
---

# Phaseo SDK TypeScript

Use this skill when the repository should call Phaseo through `@phaseo/sdk` instead of raw fetch or another compatibility client.

## Outcome
Deliver a working TypeScript or JavaScript integration that:
- imports `Phaseo` from `@phaseo/sdk`
- reads credentials from `PHASEO_API_KEY`
- uses the smallest suitable SDK surface
- preserves request ids and model ids for debugging

## Workflow
1. Create one shared `Phaseo` client.
2. Prefer the Responses API for new text integrations.
3. Reuse preset slugs instead of copying prompt and routing defaults into each caller.
4. For async video, store the returned job id and poll until terminal.
5. Validate with one small request on the exact surface you changed.

## Canonical client setup

```ts
import { Phaseo } from "@phaseo/sdk";

export const gateway = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY!,
});
```

## Preferred surface selection

- Text and multimodal generation: `generateResponse` or `streamResponse`
- Chat-style compatibility only when the caller already expects chat-shape messages
- Images: `generateImage`, `generateImageEdit`
- Audio: `generateSpeech`, `generateTranscription`, `generateTranslation`
- Video: `generateVideo`
- Discovery: `getModels`, `getHealth`

## Rules

- Prefer `generateResponse` for net-new text features unless a caller already depends on chat-specific shape.
- Keep model ids configurable and discover current ids from `/v1/models` or existing gateway discovery helpers.
- Keep API keys in env vars only.
- If the repository already has request logging, include request id, model id, and preset slug when available.

## Validation

- one successful request on the changed endpoint
- one error-path check when auth or model lookup behavior changed
- confirm async jobs are tracked by returned id instead of assuming immediate completion
