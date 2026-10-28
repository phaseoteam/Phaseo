---
name: phaseo-gateway
description: "Integrates applications with the Phaseo Gateway over OpenAI-compatible REST, the TypeScript SDK (`@phaseo/sdk`), the Python SDK (`phaseo`) or the Vercel AI SDK provider (`@phaseo/ai-sdk-provider`): base URL, API key auth, attribution headers, model IDs and smoke tests. Use when adding Phaseo to a codebase, wiring a new endpoint, seeing api.phaseo.app or PHASEO_API_KEY, or debugging auth, routing or response-shape errors. Not for moving off another provider or gateway (use phaseo-migration) or choosing models (phaseo-model-selection)."
license: MIT
---

# Phaseo Gateway

Use this skill to make high-confidence Phaseo integration changes with minimal diff size.

## Workflow
1. Identify integration surface before editing:
- OpenAI-compatible REST calls
- OpenAI SDK / Anthropic SDK pointed at Phaseo
- Official Phaseo SDK (TS/Python)
- Vercel AI SDK provider (`@phaseo/ai-sdk-provider`)

2. Select the minimal migration path:
- Keep existing SDK and only swap `baseURL` + API key when possible.
- Move to official Phaseo SDK only when explicit capability gaps or ergonomics need it.

3. Apply standard Phaseo request contract:
- Base URL: `https://api.phaseo.app`
- Auth header: `Authorization: Bearer <PHASEO_API_KEY>`
- Optional attribution headers: `x-title` and `http-referer`
- Discover model IDs from `GET /v1/models` rather than hard-coding stale IDs
- No key yet: run `phaseo login` (or `phaseo login --device-code` in a headless shell), then `phaseo keys create --name <name> --json`. Never guess a key. A person approves the sign-in.

4. Validate quickly:
- `GET /v1/health` for gateway reachability
- `GET /v1/models` for model availability/capabilities
- One smoke generation request on the target endpoint

5. Harden before finishing:
- Move keys into env vars if found inline.
- Keep API keys out of commits, logs, screenshots, and client-side bundles.
- Add retries/backoff for 429 and 5xx responses.

## Integration Playbooks
- OpenAI-compatible REST: read [`references/rest.md`](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-gateway/references/rest.md)
- TypeScript SDK: read [`references/sdk-typescript.md`](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-gateway/references/sdk-typescript.md)
- Python SDK: read [`references/sdk-python.md`](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-gateway/references/sdk-python.md)
- Migration patterns (OpenAI, Anthropic, OpenRouter, Vercel AI Gateway): read [`references/migrations.md`](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-gateway/references/migrations.md)

## Account setup without the dashboard
Do not send the user to the Phaseo dashboard. Keys, credits (`phaseo credits add`: with a saved card a workspace owner or admin confirms it from an email; with none it returns a checkout link they open to pay), BYOK, budgets, routing settings, presets and guardrails all have `phaseo` CLI commands, `/v1` Management API routes and, for many, MCP tools at `https://mcp.phaseo.app/mcp?access=manage`. A person is still needed for sign-up, approving a sign-in, paying the first top-up on the checkout link (no saved card yet), confirming each later top-up from the emailed link (saved card), and account security (password, MFA, passkeys). Top-ups need `phaseo login --scopes billing:write` before the first `phaseo credits add`. Task map: [Manage Phaseo from an agent](https://phaseo.app/docs/v1/developers/manage-from-an-agent).

## Execution Rules
- Prefer minimal and reversible changes.
- Preserve response shapes expected by callers unless explicitly requested to refactor.
- If model IDs differ between platforms, map through `/v1/models` and keep compatibility aliases where needed.
- If the user asks for best-effort migration, prioritize working endpoint and auth first, then feature parity.
