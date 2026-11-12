# Phaseo C# SDK

Official .NET SDK for Phaseo Gateway.

Package ID: `Phaseo.Sdk`

## Installation

```bash
dotnet add package Phaseo.Sdk --version 2.0.5
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

## Trusted workloads (OIDC tokens instead of an API key)

Workspaces in the trusted workloads beta can let GitHub Actions jobs and Vercel deployments call Phaseo with their short-lived OIDC token instead of an API key. Set up a trust policy in Settings → API Keys → Trusted workloads, then pass a credential provider (`Func<CancellationToken, ValueTask<string>>`) instead of `apiKey`. It is called before every request and retry, so each request uses a current token. Tokens must be issued for the audience `https://api.phaseo.app`.

`WorkloadTokens` has built-in providers. They cache each token until 60 seconds before it expires.

```csharp
using PhaseoSdk;

// GitHub Actions: the job needs `permissions: id-token: write`.
var client = Phaseo.FromApiKeyProvider(WorkloadTokens.GitHubActions());
```

```csharp
// Vercel: exchanges the deployment's OIDC token (VERCEL_OIDC_TOKEN_FILE or VERCEL_OIDC_TOKEN).
var client = Phaseo.FromApiKeyProvider(WorkloadTokens.Vercel());

// Or pass the token from the request's `x-vercel-oidc-token` header.
var perRequest = Phaseo.FromApiKeyProvider(WorkloadTokens.Vercel(
    sourceTokenProvider: _ => ValueTask.FromResult(httpContext.Request.Headers["x-vercel-oidc-token"].ToString())));
```

Any function works as a provider, for example `Phaseo.FromApiKeyProvider(async ct => await myTokenCache.GetAsync(ct))`. A blank result fails the request before it is sent, and a request that sets its own `Authorization` header keeps it.

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

Use `GetModelEndpointCapabilities` for live provider routes, or `CheckModelParameters` to highlight unsupported, partially supported, unknown, and out-of-range values before submitting a request.

```csharp
var report = await client.CheckModelParameters("openai/gpt-5.4", new Dictionary<string, object?> { ["temperature"] = 0.7 });
var preflight = await client.PreflightRequest(new Dictionary<string, object?> { ["model"] = "openai/gpt-5.4", ["input"] = "Hello", ["temperature"] = 0.7 });
```

`Pagination.Pages<T>` exposes cancellation-aware async pagination, while
`JobHandle<T>` refreshes or waits for an existing job without resubmitting it.

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

## Realtime voice (beta)

`client.Realtime.ConnectAsync(...)` creates a realtime session and opens the relay WebSocket with `System.Net.WebSockets.ClientWebSocket`; there is no extra dependency. Provider events pass through unchanged as `JsonElement`s.

```csharp
var session = await client.Realtime.ConnectAsync(new RealtimeConnectOptions { Model = "openai/gpt-realtime-2", Voice = "marin" });
using var warnings = session.OnWarning(warning => Console.WriteLine(warning.GetProperty("code").GetString()));
await session.SendAudioAsync(pcm16Chunk); // PCM16 bytes; base64 is handled for you
var ended = await session.EndAsync(reason: "caller hung up"); // session.ended: reason, usage, cost, billing_status
```

`await foreach (var item in session.EventsAsync())` reads every event until the socket closes. If the socket closes without `session.ended`, `EndAsync` throws `RealtimeSessionClosedException`, whose `FinalBillPath` is the `GET /v1/generations?id=realtime%3A<session_id>` lookup for the final cost.

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Environment variables

- `PHASEO_API_KEY` (required unless passed in code or a credential provider is used)
- `PHASEO_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:csharp`
- Build: `pnpm --filter @phaseo/csharp-sdk build`
- Test: `pnpm --filter @phaseo/csharp-sdk test`
