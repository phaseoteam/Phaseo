# Phaseo SDK (`@phaseo/sdk`)

- Use `import Phaseo from "@phaseo/sdk"`.
- Read credentials from `PHASEO_API_KEY`.
- Prefer `generateResponse` for new text and multimodal integrations.
- Use preset slugs when your application has shared prompt, routing, or parameter defaults.
- Use `music.generateAndWait`, `videos.generateAndWait`, or `batches.createAndWait` to submit once and wait for success. Use each resource's `wait(id)` to resume a known job and inspect its terminal response.
- Wait options include `timeoutMs`, `intervalMs`, `signal`, and `onPoll`. Local abort/timeout does not cancel remote work; retain the ID from `JobTimeoutError` or `JobCancelledError` to resume. Creation has its own HTTP timeout.
- Log request ids and model ids when debugging gateway behavior.
