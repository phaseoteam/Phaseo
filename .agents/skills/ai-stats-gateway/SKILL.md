---
name: ai-stats-gateway
description: Implement and migrate AI integrations to AI Stats Gateway via OpenAI-compatible REST, the official TypeScript SDK (@ai-stats/sdk), Python SDK (ai-stats-py-sdk), and Vercel AI SDK provider (@ai-stats/ai-sdk-provider). Use when wiring new API calls, replacing OpenAI/Anthropic/OpenRouter/Vercel Gateway base URLs, adding app attribution headers, selecting model IDs, or troubleshooting auth/routing/response-shape issues.
---

# AI Stats Gateway

Use this skill to make high-confidence AI Stats integration changes with minimal diff size.

## Workflow
1. Identify integration surface before editing:
- OpenAI-compatible REST calls
- OpenAI SDK / Anthropic SDK pointed at AI Stats
- Official AI Stats SDK (TS/Python)
- Vercel AI SDK provider (`@ai-stats/ai-sdk-provider`)

2. Select the minimal migration path:
- Keep existing SDK and only swap `baseURL` + API key when possible.
- Move to official AI Stats SDK only when explicit capability gaps or ergonomics need it.

3. Apply standard AI Stats request contract:
- Base URL: `https://api.phaseo.app`
- Auth header: `Authorization: Bearer <AI_STATS_API_KEY>`
- Optional attribution headers: `x-title` and `http-referer`
- Discover model IDs from `GET /v1/models` rather than hard-coding stale IDs

4. Validate quickly:
- `GET /v1/health` for gateway reachability
- `GET /v1/models` for model availability/capabilities
- One smoke generation request on the target endpoint

5. Harden before finishing:
- Move keys into env vars if found inline.
- Keep API keys out of commits, logs, screenshots, and client-side bundles.
- Add retries/backoff for 429 and 5xx responses.

## Integration Playbooks
- OpenAI-compatible REST: read `references/rest.md`
- TypeScript SDK: read `references/sdk-typescript.md`
- Python SDK: read `references/sdk-python.md`
- Migration patterns (OpenAI, Anthropic, OpenRouter, Vercel AI Gateway): read `references/migrations.md`

## Execution Rules
- Prefer minimal and reversible changes.
- Preserve response shapes expected by callers unless explicitly requested to refactor.
- If model IDs differ between platforms, map through `/v1/models` and keep compatibility aliases where needed.
- If the user asks for best-effort migration, prioritize working endpoint and auth first, then feature parity.
