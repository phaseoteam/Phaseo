# AI Stats Go SDK

Generated from the AI Stats Gateway OpenAPI spec with a thin wrapper in `index.go`.

## Install

```bash
go get github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go@latest
```

## Usage

```go
// Uses AI_STATS_API_KEY and default base URL.
client, err := aistats.NewAIStatsFromEnv()
if err != nil {
    panic(err)
}
resp, err := client.GetModels(context.Background(), nil)
```

## Release model

- Module path: `github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go`
- Publish by pushing tags in the format: `packages/sdk/sdk-go/vX.Y.Z`
