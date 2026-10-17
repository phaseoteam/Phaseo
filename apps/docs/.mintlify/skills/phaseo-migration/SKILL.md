---
name: phaseo-migration
description: Migrates existing LLM integrations to Phaseo from OpenAI, Anthropic, OpenRouter, Vercel AI Gateway, LiteLLM, Cloudflare AI Gateway, Helicone or LLM Gateway. Swaps base URL and API key with a minimal diff, maps model IDs via GET /v1/models, maps fallbacks, caching, headers and observability, and smoke tests. Use when code has api.openai.com, openrouter.ai, ai-gateway.vercel.sh, gateway.ai.cloudflare.com, helicone.ai, api.llmgateway.io or a LiteLLM proxy, or the user asks to switch to Phaseo. Not for new integrations (phaseo-gateway) or deep OpenRouter work (openrouter-to-phaseo-migration).
license: MIT
---

# Phaseo Migration

Move an existing integration onto Phaseo at the client boundary first, then map platform-specific features deliberately. Keep rollback a configuration-only change (base URL and API key) until the cutover is stable.

## Detect the source platform

Search runtime code, config, CI and deployment env files. Several platforms can appear in one repository; migrate each client separately.

| Platform | Code signals | Reference |
| --- | --- | --- |
| OpenAI | `api.openai.com`, `OPENAI_API_KEY`, `openai` package with no `baseURL`, `AzureOpenAI` | [openai.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/openai.md) |
| Anthropic | `api.anthropic.com`, `ANTHROPIC_API_KEY`, `@anthropic-ai/sdk`, `anthropic` (Python) | [anthropic.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/anthropic.md) |
| OpenRouter | `openrouter.ai`, `OPENROUTER_API_KEY`, `sk-or-v1` keys, `X-Title` headers | [openrouter.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/openrouter.md) |
| Vercel AI Gateway | `ai-gateway.vercel.sh`, `AI_GATEWAY_API_KEY`, `@ai-sdk/gateway`, bare string models in `ai` calls | [vercel-ai-gateway.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/vercel-ai-gateway.md) |
| LiteLLM | `litellm` package, `config.yaml` with `model_list`, proxy on port 4000, `LITELLM_*` vars | [litellm.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/litellm.md) |
| Cloudflare AI Gateway | `gateway.ai.cloudflare.com`, `cf-aig-*` headers, `env.AI.run(..., { gateway })` | [cloudflare-ai-gateway.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/cloudflare-ai-gateway.md) |
| Helicone | `*.helicone.ai` hosts, `Helicone-Auth`, `Helicone-*` headers, `HELICONE_API_KEY` | [helicone.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/helicone.md) |
| LLM Gateway | `api.llmgateway.io`, `LLM_GATEWAY_API_KEY`, other `LLM_GATEWAY_*` vars | [llm-gateway.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/llm-gateway.md) |

Read only the reference for the platform you found.

## Workflow

1. **Inventory.** List every client factory, base URL, key variable, model ID, custom header, fallback chain, cache setting and logging callback. Record which environments (local, CI, staging, production) hold the old key.
2. **Swap base URL and key with the smallest diff.** Keep the existing SDK and request payloads. Change only the client constructor and the key variable:

   | Client | Base URL | Key |
   | --- | --- | --- |
   | OpenAI SDK, OpenAI-compatible clients, raw HTTP | `https://api.phaseo.app/v1` | `PHASEO_API_KEY` as `Authorization: Bearer` |
   | Anthropic SDK | `https://api.phaseo.app` (the SDK appends `/v1/messages`) | `PHASEO_API_KEY` passed as `authToken` / `auth_token` |
   | Vercel AI SDK | `@phaseo/ai-sdk-provider` (defaults to `https://api.phaseo.app/v1`) | reads `PHASEO_API_KEY` |

   Keep the key server-side. Do not add a secret value to source control, logs or client bundles.
3. **Map model IDs.** Call `GET /v1/models` and check every production model ID against `data[].id`. Phaseo IDs are `<org>/<model>` (for example `openai/gpt-4.1-mini`). Do not assume an ID carries over or guess a replacement; if callers use old names, translate them in one mapping function at the client boundary. The default list contains only models routable now; `?availability=all` also shows inactive or coming-soon ones.
4. **Map platform features.** Use the reference file's mapping table. Shared Phaseo equivalents:

   | Need | Phaseo equivalent |
   | --- | --- |
   | Model fallbacks | Request `models` array (1 to 25, tried after `model` on 429/5xx) or dynamic routes |
   | Provider order, allow and deny lists | `provider.order`, `provider.only`, `provider.ignore`, `provider.sort` |
   | Zero data retention, regions | `provider.require_zero_data_retention`, `provider.required_execution_region`, `provider.required_data_region` |
   | Shared prompts, parameters, routing defaults | Presets, invoked as `"model": "@slug"` |
   | Response caching | Preset-level response caching (`response_caching.enabled`, `ttl_seconds`) |
   | Prompt caching | `cache_control` (top level or per block), `prompt_cache_retention` |
   | App attribution | `X-App-Id`, `X-App-Name`, `HTTP-Referer`, `X-App-Categories`, `X-Title` |
   | Custom properties, cost tags | `X-Phaseo-Metadata: {"labels":[{"key":"team","value":"support"}]}` |
   | End-user ID | `user` body field or `X-Phaseo-User-Id` header |
   | Session grouping and cache affinity | `session_id` body field |
   | Rate limits, budgets, key restrictions | Rate limit policies, key limits and budgets (see `phaseo-guardrails`) |
   | Request logs, telemetry export | Dashboard request logs, `GET /v1/generations?id=<request_id>`, observability destinations (webhook or OpenTelemetry), or keep client-side tracing |

   If something has no equivalent, say so in the report and keep it in one adapter rather than at every call site. Remove headers that only the old platform understood.
5. **Smoke test with `phaseo/free`** (it works without a wallet balance), then repeat the non-streaming call with each mapped production model ID:

   ```bash
   curl -s https://api.phaseo.app/v1/health
   curl -s https://api.phaseo.app/v1/models -H "Authorization: Bearer $PHASEO_API_KEY" | jq -r '.data[].id'
   curl -s https://api.phaseo.app/v1/chat/completions \
     -H "Authorization: Bearer $PHASEO_API_KEY" -H "Content-Type: application/json" \
     -d '{"model":"phaseo/free","messages":[{"role":"user","content":"Reply with: ok"}]}'
   curl -N https://api.phaseo.app/v1/chat/completions \
     -H "Authorization: Bearer $PHASEO_API_KEY" -H "Content-Type: application/json" \
     -d '{"model":"phaseo/free","stream":true,"messages":[{"role":"user","content":"Reply with: stream ok"}]}'
   curl -s https://api.phaseo.app/v1/chat/completions \
     -H "Authorization: Bearer $PHASEO_API_KEY" -H "Content-Type: application/json" \
     -d '{"model":"example/not-a-model","messages":[{"role":"user","content":"test"}]}'
   ```

   Use the endpoint the app actually calls: `/v1/responses` bodies take `input`; `/v1/chat/completions` and `/v1/messages` bodies take `messages` (Anthropic-style bodies also send `max_tokens`). Then run the app's own client path once with `phaseo/free`, including streaming, tools and structured output if it uses them.
6. **Roll out and report.** Ship behind a flag or a small traffic slice, compare output, latency, token usage and cost against the old path, then promote.

## Checklist

```text
- [ ] Source platform(s) detected; every client, env var and header inventoried
- [ ] Base URL and key swapped at the client boundary only; no secret in the diff
- [ ] PHASEO_API_KEY set in every environment that held the old key
- [ ] Every production model ID found in GET /v1/models, or mapped in one function
- [ ] Platform-only headers removed or mapped; feature gaps listed
- [ ] Health, models, non-streaming, streaming and invalid-model checks pass with phaseo/free
- [ ] Each mapped production model ID passes one real request
- [ ] Tools and structured outputs rechecked where used
- [ ] Rollback is a base URL and key change
```

## Report

Finish with: changed files; env var changes (old name to `PHASEO_API_KEY`, no values); model ID mapping (old to new); feature mapping and gaps; smoke test evidence; rollback switch.

## Rules

- Change the boundary first; do not combine the cutover with prompt, model or routing optimization.
- Never print, log or commit API keys. Use `process.env.PHASEO_API_KEY` or `os.environ["PHASEO_API_KEY"]`.
- Do not switch production traffic without the user's approval.
- Add exponential backoff for 429 and 5xx; respect `Retry-After`.

## Related skills

- `phaseo-gateway`: new integrations and general REST or SDK usage.
- `openrouter-to-phaseo-migration`: detailed OpenRouter playbook.
- `phaseo-routing-presets`: presets, routing policy and response caching.
- `phaseo-guardrails`: key restrictions, rate limits and budgets.
- `phaseo-async-webhooks`: batches, async jobs and webhooks.
