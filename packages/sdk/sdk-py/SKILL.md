# Phaseo Python SDK (`phaseo`)

- Use `from phaseo import Phaseo`.
- Read credentials from `PHASEO_API_KEY`.
- Prefer `generate_response` for new text and multimodal integrations.
- Use preset slugs when your application has shared prompt, routing, or parameter defaults.
- Use `music.generate_and_wait`, `videos.generate_and_wait`, or `batches.create_and_wait` to submit once and wait for success. Use each resource's `wait(id)` to resume and inspect a terminal response.
- Wait options include `timeout` and `interval` in seconds, `on_poll`, and `cancel_event`. The synchronous client checks cancellation/deadlines between HTTP calls. Local timeout/cancellation does not cancel remote work; retain `job_id` from the exception to resume.
- Log request ids and model ids when debugging gateway behavior.
- Use `AsyncPhaseo` with `async with`, `await client.responses.create(...)`, and `async for event in client.responses.stream(...)` for native async applications.
- Both clients support immutable `with_options(timeout=..., max_retries=...)`. Retries apply only to GET/HEAD. Async cancellation uses asyncio task cancellation.
- Dictionary-compatible responses expose `request_id`, `trace_url`, and `output_text`. `PhaseoHTTPError` exposes `code`, `request_id`, and `retry_after` in seconds.
- Job resources support `start` and `resume` handles with `result`, `events`, and `to_dict`. Remote music cancellation is unsupported.
- Use `parse_output(response, PydanticModel)` for validated output; configure server structured output explicitly in the request.
- Use `models.check_parameters(model_id, values, endpoint=..., provider=...)` for live, structured parameter support and `models.capabilities(model_id)` for raw endpoint capability rows. The same methods are awaitable on `AsyncPhaseo`.
- Inject `phaseo.testing.MockTransport` through an HTTPX client for deterministic tests with no network fallback.
