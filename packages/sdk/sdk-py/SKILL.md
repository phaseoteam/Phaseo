# Phaseo Python SDK (`phaseo`)

- Use `from phaseo import Phaseo`.
- Read credentials from `PHASEO_API_KEY`.
- Prefer `generate_response` for new text and multimodal integrations.
- Use preset slugs when your application has shared prompt, routing, or parameter defaults.
- Use `music.generate_and_wait`, `videos.generate_and_wait`, or `batches.create_and_wait` to submit once and wait for success. Use each resource's `wait(id)` to resume and inspect a terminal response.
- Wait options include `timeout` and `interval` in seconds, `on_poll`, and `cancel_event`. The synchronous client checks cancellation/deadlines between HTTP calls. Local timeout/cancellation does not cancel remote work; retain `job_id` from the exception to resume.
- Log request ids and model ids when debugging gateway behavior.
