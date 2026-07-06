# Smoke Test Configuration

All SDK smoke tests use the same Phaseo environment variable contract so each language can be checked against the same gateway, model, and prompt.

## Configuration File

Location: `packages/sdk/smoke-manifest.json`

The manifest defines the shared API key variable, base URL variable, default base URL, smoke model, request bodies, expected statuses, and validation constraints.

## Default Smoke Model

All SDK smoke tests default to `openai/gpt-5.4-nano`.

This keeps the live checks cheap and fast while still exercising the text generation path used by the SDK clients.

## Environment Variables

Required:

```bash
PHASEO_API_KEY=your-phaseo-api-key
```

Optional:

```bash
PHASEO_BASE_URL=https://api.phaseo.ai/v1
PHASEO_SMOKE_MODEL=openai/gpt-5.4-nano
PHASEO_SMOKE_INPUT=Hi
PHASEO_SMOKE_MAX_OUTPUT_TOKENS=32
```

The smoke tests should not use old `AI_STATS_*` or `AISTATS_*` variables.

## SDK Coverage

| SDK | Phaseo env vars | Default model | Input override | Token override |
|-----|-----------------|---------------|----------------|----------------|
| TypeScript | Yes | `openai/gpt-5.4-nano` | Yes | Yes |
| Python | Yes | `openai/gpt-5.4-nano` | Yes | Yes |
| Go | Yes | `openai/gpt-5.4-nano` | Yes | Yes |
| Rust | Yes | `openai/gpt-5.4-nano` | Yes | Yes for responses |
| C# | Yes | `openai/gpt-5.4-nano` | Yes | Yes for responses |
| Java | Yes | `openai/gpt-5.4-nano` | Yes | Yes for responses |
| PHP | Yes | `openai/gpt-5.4-nano` | Yes | Yes for responses |
| Ruby | Yes | `openai/gpt-5.4-nano` | Yes | Yes for responses |
| C++ | Yes | `openai/gpt-5.4-nano` | Yes | Yes for responses |

## Expected Live Check

The minimal live check is:

```json
{
  "model": "openai/gpt-5.4-nano",
  "input": "Hi",
  "max_output_tokens": 32
}
```

For chat-completions smoke tests, the same input is sent as the user message.

## Troubleshooting

If a smoke test fails with an invalid model error, confirm that the API key can access `openai/gpt-5.4-nano` and that `PHASEO_SMOKE_MODEL` has not been overridden.

If a smoke test fails before making a request, confirm `PHASEO_API_KEY` is set in the process environment or in the `.env.local` file used by the specific package script.

If a smoke test hits the wrong host, set `PHASEO_BASE_URL=https://api.phaseo.ai/v1`.
