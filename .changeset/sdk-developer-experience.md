---
"@phaseo/sdk": minor
"@phaseo/py-sdk": major
"@phaseo/web": minor
---

Add shared SDK request controls and diagnostics, native Python async resources,
resumable media jobs, structured output and streaming helpers, model capability
preflight, and deterministic testing transports. Export submitted room requests
as runnable TypeScript or Python and link requests to dashboard traces.

Python JSON requests now use HTTPX. Catch PhaseoHTTPError (or
httpx.HTTPStatusError) instead of urllib.error.HTTPError, and use error.status
for the HTTP status; error.code contains the API error code.
