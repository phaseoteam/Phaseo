# AI Stats Go SDK (preview)

This package is generated from the AI Stats Gateway OpenAPI spec. Only the `models` endpoint is surfaced via the thin wrapper in `index.go` today.

Status:

-   **Preview**: Not published yet. Will be released to `pkg.go.dev` once the API surface is hardened.
-   Generated via `pnpm openapi:gen:go`.

Usage (after generation):

```go
client := aistats.New("<API_KEY>", "https://api.phaseo.app/v1")
resp, _, err := client.GetModels(context.Background(), nil)
```

Devtools:

- Telemetry capture is bundled in the SDK family.
- On package install, you will be prompted to optionally install the viewer.
- You can always run the viewer directly with:

```bash
npx @ai-stats/devtools-viewer
```

Python and TypeScript SDKs are fully supported today; other languages will follow soon.
