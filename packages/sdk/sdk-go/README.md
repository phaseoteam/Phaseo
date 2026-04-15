# AI Stats Go SDK

Official Go SDK for AI Stats Gateway.

Module path:

`github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go`

## Installation

```bash
go get github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go@latest
```

## Quick start

```go
package main

import (
	"context"
	"fmt"

	aistats "github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go"
	gen "github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go/src/gen"
)

func main() {
	client, err := aistats.NewAIStatsFromEnv()
	if err != nil {
		panic(err)
	}

	resp, err := client.CreateResponse(context.Background(), gen.ResponsesRequest{
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
- `GetModelDeprecationInfo(ctx, modelID)`
- `ValidateModel(ctx, modelID)`

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Environment variables

- `AI_STATS_API_KEY` (required unless passed in code)
- `AI_STATS_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:go`
- Run tests: `pnpm test:sdk-go`
- Smoke tests: `pnpm --filter @ai-stats/go-sdk run smoke:responses:sdk`
