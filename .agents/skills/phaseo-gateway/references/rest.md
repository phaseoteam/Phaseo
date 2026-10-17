# REST Integration (OpenAI-compatible)

## Base Contract
- Base URL: `https://api.phaseo.app`
- Auth: `Authorization: Bearer <PHASEO_API_KEY>`
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
  -H "Authorization: Bearer $PHASEO_API_KEY" \
  -H "Content-Type: application/json" \
  -H "x-title: Example App" \
  -H "http-referer: https://example.com" \
  -d '{
    "model": "phaseo/free",
    "input": "Return exactly: ok"
  }'
```

## Fetch Example
```ts
const response = await fetch("https://api.phaseo.app/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.PHASEO_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "phaseo/free",
    messages: [{ role: "user", content: "Summarize this in one sentence." }],
  }),
});
```

## Multi-turn Chat with `/v1/responses`
1. Send the first turn with `model` and `input`.
2. On each later turn, pass `previous_response_id` from the last successful response instead of resending the history.
3. Read the reply from `output_text`. If it is absent, join the `text` parts of `output[].content[]`.
4. When the user switches model, clear the conversation state and `previous_response_id`.

```json
{
  "model": "phaseo/free",
  "input": "Now list the action items.",
  "previous_response_id": "resp_..."
}
```

## Video Jobs
Video generation is asynchronous:
- Create: `POST /v1/videos`
- Status: `GET /v1/videos/{video_id}`; poll every 20 seconds or so until it reaches a terminal state.
- Download: `POST /v1/videos/{video_id}/download_url` for a signed URL, or `GET /v1/videos/{video_id}/content` for the bytes.
- Cancel an in-progress job: `POST /v1/videos/{video_id}/cancel`
- Delete: `DELETE /v1/videos/{video_id}`

## Errors and Retries
- Retry `429`, `5xx`, and transient network failures with exponential backoff and jitter.
- Do not retry `400` (fix the request), `401`/`403` (fix or refresh credentials first), or `404` (wrong path, resource, or model ID).
- Normalise errors at your integration boundary to: the endpoint, HTTP status, `code` if present, `message`, `request_id` if present, and whether the error is retryable.

## Validation Sequence
1. `GET /v1/health` returns healthy.
2. `GET /v1/models` includes target model.
3. One generation request returns 200 with non-empty output.
