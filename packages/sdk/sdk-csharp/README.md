# AI Stats C# SDK (preview)

Generated from the AI Stats Gateway OpenAPI spec. The current wrapper (`Client.cs`) only exposes the `models` endpoint to lay groundwork.

Status:
- **Preview**: Not published yet. Will be released to NuGet once the client surface stabilises.
- Generate with `pnpm openapi:gen:csharp`.

Usage (after generation):
```csharp
var client = new AiStatsSdk.Client("<API_KEY>");
var models = client.GetModels(limit: 5);
```

Devtools:

- Telemetry capture is bundled in the SDK family.
- On package install, you will be prompted to optionally install the viewer.
- You can always run the viewer directly with:

```bash
npx @ai-stats/devtools-viewer
```

Note: Python and TypeScript SDKs are fully supported today; other languages will follow soon.
