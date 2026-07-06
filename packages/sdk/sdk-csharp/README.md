# Phaseo C# SDK

Official .NET SDK for Phaseo Gateway.

Package ID: `Phaseo.Sdk`

## Installation

If published in your feed:

```bash
dotnet add package Phaseo.Sdk
```

From this monorepo:

```bash
dotnet add ./packages/sdk/sdk-csharp/Phaseo.Sdk.csproj
```

## Quick start

```csharp
using PhaseoSdk;

var client = new Phaseo(
    apiKey: Environment.GetEnvironmentVariable("PHASEO_API_KEY"),
    basePath: Environment.GetEnvironmentVariable("PHASEO_BASE_URL") ?? "https://api.phaseo.app/v1"
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
- `ListOrganisations(...)` for paginated `/organisations` discovery
- `ListPricingModels(...)` for `/pricing/models` catalogue pricing discovery
- `CalculatePricing(...)` for `/pricing/calculate` usage estimation
- `ListProviders(...)`, `GetCredits(...)`, `GetActivity(...)`, and `GetAnalytics(...)` for provider discovery and management-key usage surfaces
- `ListApiKeys(...)` for management-key `/keys` discovery
- `CreateApiKey(...)`, `UpdateApiKey(id, ...)`, and `DeleteApiKey(id)` for management-key API-key lifecycle changes
- `GetApiKey(id)` for management-key `/keys/{id}` lookup
- `ListWorkspaces(...)`, `GetWorkspace(id)`, `CreateWorkspace(...)`, `UpdateWorkspace(id, ...)`, and `DeleteWorkspace(id)` for management-key workspace lifecycle management
- `GetCurrentApiKey()`
- `Health()`
- `GetModelDeprecationInfo(modelId)`
- `ValidateModel(modelId)`

Model discovery supports the public `/models` filters, including `provider`, `provider_status`, `provider_routing_status`, `model_routing_status`, `capability_status`, `provider_availability_status`, `provider_availability_reason`, `status`, `organisation`, `endpoints`, `input_types`, `output_types`, `params`, `availability`, `limit`, and `offset`.

Use `provider_availability_reason` with `availability = "all"` when you want rollout-state entries such as `preview_only`, `provider_not_ready`, `gated`, `access_limited`, `region_limited`, `project_limited`, `paused`, or `soft_blocked`. Use `capability_status` with `availability = "all"` when you want non-routable endpoint mappings such as `coming_soon` or `internal_testing`.

```csharp
var models = await client.ListModels(new Dictionary<string, string>
{
    ["provider"] = "anthropic",
    ["provider_status"] = "beta,not_ready",
    ["provider_availability_reason"] = "preview_only,provider_not_ready",
    ["capability_status"] = "coming_soon,internal_testing",
    ["availability"] = "all",
});
```

## Async job websocket helpers

Batch and video operations can expose a websocket lifecycle stream at `/v1/async/{kind}/{id}/ws`.

```csharp
var batchSocketUrl = client.GetBatchWebSocketUrl("batch_123", intervalMs: 1500);
var videoSocketUrl = client.GetVideoWebSocketUrl("video_123", closeOnTerminal: true);
var genericSocketUrl = client.GetAsyncJobWebSocketUrl("video", "video_123");
var resourceSocketUrl = client.AsyncJobs.WebSocketUrl("video", "video_123");

Console.WriteLine(batchSocketUrl);
Console.WriteLine(videoSocketUrl);
Console.WriteLine(genericSocketUrl);
Console.WriteLine(resourceSocketUrl);
```

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Environment variables

- `PHASEO_API_KEY` (required unless passed in code)
- `PHASEO_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:csharp`
- Build: `pnpm --filter @phaseo/csharp-sdk build`
- Test: `pnpm --filter @phaseo/csharp-sdk test`
