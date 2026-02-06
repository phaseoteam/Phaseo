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

Note: Python and TypeScript SDKs are fully supported today; other languages will follow soon.
