# Phaseo Go SDK

Official Go SDK for Phaseo Gateway.

Module path:

`github.com/phaseoteam/Phaseo/packages/sdk/sdk-go`

## Installation

```bash
go get github.com/phaseoteam/Phaseo/packages/sdk/sdk-go@latest
```

## Quick start

```go
package main

import (
	"context"
	"fmt"

	phaseo "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go"
)

func main() {
	client, err := phaseo.NewPhaseoFromEnv()
	if err != nil {
		panic(err)
	}

	resp, err := client.CreateResponse(context.Background(), phaseo.ResponsesRequest{
		Model: "google/gemma-3-27b:free",
		Input: "Reply with: Go SDK works",
	})
	if err != nil {
		panic(err)
	}

	fmt.Println(resp.Id)
}
```

## Common methods

- `CreateResponse(ctx, req)`
- `CreateChatCompletion(ctx, req)`
- `GetModels(ctx, query)`
- `ListOrganisations(ctx, query)` for paginated `/organisations` discovery
- `ListPricingModels(ctx, query)` for `/pricing/models` catalogue pricing discovery
- `CalculatePricing(ctx, payload)` for `/pricing/calculate` usage estimation
- `ListProviders(ctx, query)`, `GetCredits(ctx, query)`, `GetActivity(ctx, query)`, and `GetAnalytics(ctx, query)` for provider discovery and management-key usage surfaces
- `ListApiKeys(ctx, query)` for management-key `/keys` discovery
- `CreateApiKey(ctx, payload)`, `UpdateApiKey(ctx, keyID, payload)`, and `DeleteApiKey(ctx, keyID)` for management-key API-key lifecycle changes
- `GetApiKey(ctx, keyID)` for management-key `/keys/{id}` lookup
- `ListWorkspaces(ctx, query)`, `GetWorkspace(ctx, id)`, `CreateWorkspace(ctx, body)`, `UpdateWorkspace(ctx, id, body)`, and `DeleteWorkspace(ctx, id)` for management-key workspace lifecycle management
- `GetCurrentApiKey(ctx)`
- `Health(ctx)`
- `GetModelDeprecationInfo(ctx, modelID)`
- `ValidateModel(ctx, modelID)`

Model discovery supports the public `/models` filters, including `provider`, `provider_status`, `provider_routing_status`, `model_routing_status`, `capability_status`, `provider_availability_status`, `provider_availability_reason`, `status`, `organisation`, `endpoints`, `input_types`, `output_types`, `params`, `availability`, `limit`, and `offset`.

Use `provider_availability_reason` with `availability=all` when you want rollout-state entries such as `preview_only`, `provider_not_ready`, `gated`, `access_limited`, `region_limited`, `project_limited`, `paused`, or `soft_blocked`. Use `capability_status` with `availability=all` when you want non-routable endpoint mappings such as `coming_soon` or `internal_testing`.

```go
models, err := client.GetModels(ctx, map[string]string{
	"provider": "anthropic",
	"provider_status": "beta,not_ready",
	"provider_availability_reason": "preview_only,provider_not_ready",
	"capability_status": "coming_soon,internal_testing",
	"availability": "all",
})
if err != nil {
	panic(err)
}
fmt.Println(models)
```

## Async job websocket helpers

Batch and video operations can expose a websocket lifecycle stream at `/v1/async/{kind}/{id}/ws`.

```go
intervalMs := 1500
closeOnTerminal := true

batchSocketURL, err := client.GetBatchWebSocketURL("batch_123", &phaseo.AsyncJobWebSocketOptions{
	IntervalMS: intervalMs,
})
if err != nil {
	panic(err)
}

videoSocketURL, err := client.GetVideoWebSocketURL("video_123", &phaseo.AsyncJobWebSocketOptions{
	CloseOnTerminal: &closeOnTerminal,
})
if err != nil {
	panic(err)
}

genericSocketURL, err := client.GetAsyncJobWebSocketURL("video", "video_123", nil)
if err != nil {
	panic(err)
}

resourceSocketURL, err := client.AsyncJobs.WebSocketURL("video", "video_123", nil)
if err != nil {
	panic(err)
}

fmt.Println(batchSocketURL, videoSocketURL, genericSocketURL, resourceSocketURL)
```

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Environment variables

- `PHASEO_API_KEY` (required unless passed in code)
- `PHASEO_BASE_URL` (optional, defaults to `https://api.phaseo.ai/v1`)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:go`
- Run tests: `pnpm test:sdk-go`
- Smoke tests: `pnpm --filter @phaseo/go-sdk run smoke:responses:sdk`
