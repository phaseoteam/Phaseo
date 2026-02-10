package tests

import (
	"encoding/json"
	"os"
	"testing"

	gen "github.com/AI-Stats/ai-stats-go-sdk-wrapper/src/gen"
)

func TestSmokeChat(t *testing.T) {
	apiKey := os.Getenv("AI_STATS_API_KEY")
	if apiKey == "" {
		t.Skip("AI_STATS_API_KEY is required")
	}
	baseURL := os.Getenv("AI_STATS_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.phaseo.app/v1"
	}

	client := gen.NewClient(baseURL)
	client.Headers["Authorization"] = "Bearer " + apiKey

	body := map[string]any{
		"model": "openai/gpt-5-nano",
		"input": "Hi",
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
