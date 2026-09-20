# Phaseo SDK (`@phaseo/sdk`)

- Use `import Phaseo from "@phaseo/sdk"`.
- Read credentials from `PHASEO_API_KEY`.
- Prefer `generateResponse` for new text and multimodal integrations.
- Use preset slugs when your application has shared prompt, routing, or parameter defaults.
- Use `music.generateAndWait`, `videos.generateAndWait`, or `batches.createAndWait` to submit once and wait for success. Use each resource's `wait(id)` to resume a known job and inspect its terminal response.
- Wait options include `timeoutMs`, `intervalMs`, `signal`, and `onPoll`. Local abort/timeout does not cancel remote work; retain the ID from `JobTimeoutError` or `JobCancelledError` to resume. Creation has its own HTTP timeout.
- Log request ids and model ids when debugging gateway behavior.
- Use `client.withOptions({ signal, timeoutMs, maxRetries })` for immutable request controls. Retries apply only to GET/HEAD, never paid submissions.
- `responseMetadata(result)` provides request and dashboard trace identifiers. HTTP errors expose `code`, `requestId`, `traceUrl`, and `retryAfterMs`.
- Job resources expose `start`, `resume`, `result`, `events`, and `toJSON`. Remote music cancellation is unsupported.
- Use `responses.parse(request, schema)` or `parseOutput(response, schema)` with a Zod-compatible parser. Configure server structured output in the request explicitly.
- Use `checkModelCapabilities` for advertised capabilities, `batchResults` for incremental JSONL, `downloadTo` for media, and `@phaseo/sdk/testing` for local fixtures.
