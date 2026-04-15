# AI Stats C# SDK

Official .NET SDK for AI Stats Gateway.

Package ID: `AI.Stats.Sdk`

## Installation

If published in your feed:

```bash
dotnet add package AI.Stats.Sdk
```

From this monorepo:

```bash
dotnet add ./packages/sdk/sdk-csharp/AIStats.Sdk.csproj
```

## Quick start

```csharp
using AiStatsSdk;

var client = new AIStats(
    apiKey: Environment.GetEnvironmentVariable("AI_STATS_API_KEY"),
    basePath: Environment.GetEnvironmentVariable("AI_STATS_BASE_URL") ?? "https://api.phaseo.app/v1"
);

var response = await client.CreateResponse(new Dictionary<string, object>
{
    ["model"] = "google/gemma-3-27b:free",
    ["input"] = "Reply with: C# SDK works",
});

Console.WriteLine(response?["id"]);
```

## Common methods

- `CreateResponse(...)`
- `CreateChatCompletion(...)`
- `ListModels(...)`
- `GetModelDeprecationInfo(modelId)`
- `ValidateModel(modelId)`

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Environment variables

- `AI_STATS_API_KEY` (required unless passed in code)
- `AI_STATS_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:csharp`
- Build: `pnpm --filter @ai-stats/csharp-sdk build`
- Test: `pnpm --filter @ai-stats/csharp-sdk test`
