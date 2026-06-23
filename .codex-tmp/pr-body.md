## What changed
- Normalized provider env names across the API, runtime bindings, tests, and model-discovery scripts so the app uses one canonical key per provider.
- Updated the discovery/config path for Arcee, CrofAI, ElevenLabs, GMICloud, Nebius, Together, AkashML, Google AI Studio, Clarifai, and Friendli to match the canonical names.
- Added the new StepFun `step-3.7-flash` catalog entries for StepFun, DeepInfra, and Novita.
- Hardened provider response handling so discovery fails fast when providers return error-shaped JSON instead of a model list.

## Why
- The previous alias drift caused confusing env setup and made it harder to keep local dev, Cloudflare, and discovery behavior aligned.
- Model discovery was also silently trusting some provider error envelopes, which can hide upstream failures.

## Validation
- `pnpm --filter @ai-stats/gateway-api exec vitest run src/providers/openai-compatible/__tests__/config.test.ts src/pipeline/model-discovery/helpers.test.ts src/pipeline/model-discovery/github-issues.test.ts`
- `pnpm exec tsx scripts/model-discovery/validate-providers.ts`
