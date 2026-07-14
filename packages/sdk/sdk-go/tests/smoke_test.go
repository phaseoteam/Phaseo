package tests

import (
	"encoding/json"
	"os"
	"strconv"
	"testing"

	gen "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/src/gen"
)

func TestSmokeChat(t *testing.T) {
	apiKey := os.Getenv("PHASEO_API_KEY")
	if apiKey == "" {
		t.Skip("PHASEO_API_KEY is required")
	}
	baseURL := os.Getenv("PHASEO_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.phaseo.app/v1"
	}

	client := gen.NewClient(baseURL)
	client.Headers["Authorization"] = "Bearer " + apiKey
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

	body := map[string]any{
		"model":             model,
		"input":             input,
		"max_output_tokens": maxOutputTokens,
	}

	raw, err := client.Request("POST", "/responses", nil, nil, body)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	var out any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	pretty, _ := json.MarshalIndent(out, "", "  ")
	t.Log(string(pretty))
}
