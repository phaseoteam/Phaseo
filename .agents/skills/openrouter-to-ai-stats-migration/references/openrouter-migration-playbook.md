# OpenRouter to AI Stats Playbook

## Quick Diff Targets
- Base URL:
  - from `https://openrouter.ai/api/v1`
  - to `https://api.phaseo.app/v1`
- API key env:
  - from `OPENROUTER_API_KEY`
  - to `AI_STATS_API_KEY`
- Attribution headers:
  - keep `x-title` and `http-referer` when caller identity is known

## Search Patterns
- `openrouter.ai`
- `OPENROUTER_API_KEY`
- `sk-or-v1`
- `"openai/"`, `"anthropic/"`, `"google/"` (common provider prefixes in model IDs)

## REST Migration Template
```ts
const response = await fetch("https://api.phaseo.app/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.AI_STATS_API_KEY}`,
    "Content-Type": "application/json",
    "x-title": "Your App Name",
    "http-referer": "https://your-app.example",
  },
  body: JSON.stringify({
    model: mappedModelId,
    messages: [{ role: "user", content: "Return exactly: ok" }],
    stream: false,
  }),
});
```

## Model Mapping Boundary
Use a single mapper function so callers keep current model names while migration is in progress.

```ts
const openRouterToAiStatsModelMap: Record<string, string> = {
  "openai/gpt-4o": "gpt-4o",
  "openai/gpt-4": "gpt-4",
};

export function mapModelId(input: string): string {
  return openRouterToAiStatsModelMap[input] ?? input;
}
```

Then validate each mapped value exists in `GET /v1/models` before rollout.

## Validation Commands
```bash
curl https://api.phaseo.app/v1/health
```

```bash
curl https://api.phaseo.app/v1/models \
  -H "Authorization: Bearer $AI_STATS_API_KEY"
```

```bash
curl https://api.phaseo.app/v1/chat/completions \
  -H "Authorization: Bearer $AI_STATS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role":"user","content":"Return exactly: ok"}]
  }'
```

## Recommended Migration Report Format
1. Scope: files/components migrated.
2. Config changes: env vars, secrets, and base URLs updated.
3. Model mapping: old IDs to new IDs.
4. Validation evidence: health/models/non-streaming/streaming/failure-path.
5. Parity gaps: unsupported or behavior differences.
6. Rollback plan: exact revert switch.
