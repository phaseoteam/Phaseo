# Live Integration Test Suites

## Text Modern Feature Matrix

This suite validates modern text-generation behavior across providers:

- Streaming text (`/chat/completions`, `/responses`, `/messages`)
- Native tool calling (OpenAI and Anthropic tool shapes)
- Structured outputs (`json_schema`)
- Reasoning parameter pass-through
- Internal datetime server tool (streaming)

Run it with:

```bash
pnpm --filter @ai-stats/gateway-api test:live:text-modern
```

Required environment:

- `LIVE_RUN=1`
- `LIVE_TEXT_MODERN_RUN=1`
- `GATEWAY_API_KEY` (or compatible gateway auth envs already used by tests)

Useful optional environment:

- `LIVE_TEXT_MODERN_PROVIDERS=openai,google-ai-studio,minimax`
- `LIVE_TEXT_MODERN_SCENARIOS=chat_stream_text,responses_stream_tool`
- `LIVE_TEXT_MODERN_MODEL_OVERRIDES=openai=openai/gpt-5-nano`
- `LIVE_TEXT_MODERN_ALLOW_UNSUPPORTED=1` (default)
- `LIVE_TEXT_MODERN_ALLOW_TRANSIENT_FAILURES=1` (default)

Results are written to:

- `apps/api/reports/provider-live/text-modern-features.json`
