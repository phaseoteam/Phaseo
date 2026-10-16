---
name: phaseo-sdk-python
description: Implement Phaseo integrations with the official Python SDK (`phaseo`). Use when repositories already depend on `phaseo`, need a new client setup, Responses API calls, async video jobs, preset usage, or request logging patterns for the Python SDK surface.
---

# Phaseo SDK Python

Use this skill when the repository should call Phaseo through `phaseo` instead of raw `httpx`, `requests`, or another compatibility client.

## Outcome
Deliver a working Python integration that:
- imports `Phaseo` from `phaseo`
- reads credentials from `PHASEO_API_KEY`
- uses the smallest suitable SDK helper
- logs enough request context to debug failures safely

## Workflow
1. Create one shared `Phaseo` client.
2. Prefer the Responses API helpers for new text integrations.
3. Reuse preset slugs instead of copying prompt and routing defaults into each caller.
4. For async video, persist the returned job id and poll status until terminal.
5. Validate the exact surface you changed with a minimal request.

## Canonical client setup

```python
import os

from phaseo import Phaseo

gateway = Phaseo(api_key=os.environ["PHASEO_API_KEY"])
```

## Preferred surface selection

- Text and multimodal generation: `generate_response`, `stream_response`
- Chat-style compatibility only for callers that already expect chat-shaped payloads
- Images: `generate_image`, `generate_image_edit`
- Audio: `generate_speech`, `generate_transcription`, `generate_translation`
- Video: `generate_video`
- Discovery: `get_models`, `get_health`

## Rules

- Prefer `generate_response` for net-new text features unless the caller is already built around chat-style messages.
- Keep model ids configurable and refresh them from `/v1/models` or repository discovery helpers.
- Keep API keys out of notebooks, fixtures, and committed scripts.
- If the application already logs request metadata, include request id, model id, and preset slug when available.

## Validation

- one successful request on the changed endpoint
- one error-path check when auth or model lookup behavior changed
- confirm async jobs are tracked by returned id instead of assuming immediate completion
