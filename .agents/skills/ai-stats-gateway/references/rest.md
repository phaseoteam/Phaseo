# REST Integration (OpenAI-compatible)

## Base Contract
- Base URL: `https://api.phaseo.app`
- Auth: `Authorization: Bearer <AI_STATS_API_KEY>`
- Content type: `application/json`

## Core Endpoints
- `POST /v1/responses`
- `POST /v1/chat/completions`
- `POST /v1/messages`
- `GET /v1/models`
- `GET /v1/health`

## Attribution Headers
Add these when the caller app is known:
- `x-title`: human app name
- `http-referer`: source URL

## Minimal curl Smoke Test
```bash
curl https://api.phaseo.app/v1/responses \
  -H "Authorization: Bearer $AI_STATS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "x-title: Example App" \
  -H "http-referer: https://example.com" \
  -d '{
    "model": "gpt-5-nano-2025-08-07",
    "messages": [{"role": "user", "content": "Return exactly: ok"}]
  }'
```

## Fetch Example
```ts
const response = await fetch("https://api.phaseo.app/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.AI_STATS_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-5-nano-2025-08-07",
    messages: [{ role: "user", content: "Summarize this in one sentence." }],
  }),
});
```

## Validation Sequence
1. `GET /v1/health` returns healthy.
2. `GET /v1/models` includes target model.
3. One generation request returns 200 with non-empty output.
