package tests

import (
	"context"
	"os"
	"strconv"
	"testing"

	phaseo "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go"
	gen "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/src/gen"
)

func TestSmokeResponsesSDK(t *testing.T) {
	apiKey := os.Getenv("PHASEO_API_KEY")
	if apiKey == "" {
		t.Skip("PHASEO_API_KEY is required")
	}

	baseURL := os.Getenv("PHASEO_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.phaseo.ai/v1"
	}

	model := os.Getenv("PHASEO_SMOKE_MODEL")
	if model == "" {
		model = "openai/gpt-5.4-nano"
	}

	input := os.Getenv("PHASEO_SMOKE_INPUT")
	if input == "" {
		input = "Hi"
	}

	maxOutputTokens := 32
	if raw := os.Getenv("PHASEO_SMOKE_MAX_OUTPUT_TOKENS"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			maxOutputTokens = parsed
		}
	}

	client := phaseo.New(
		apiKey,
		baseURL,
		phaseo.WithDeprecationWarnings(false),
	)

	response, err := client.CreateResponse(context.Background(), gen.ResponsesRequest{
		Model:           model,
		Input:           input,
		MaxOutputTokens: &maxOutputTokens,
	})
	if err != nil {
		t.Fatalf("CreateResponse failed: %v", err)
	}
	if response.Id == nil || *response.Id == "" {
		t.Fatalf("missing response id: %+v", response)
	}
	t.Logf("id=%s model=%s", *response.Id, model)
}
