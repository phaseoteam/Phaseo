package aistats

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	gen "github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go/src/gen"
)

func TestDevtoolsCapturesResponsesRequests(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/data/models":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"models": []map[string]any{
					{
						"model_id": "openai/gpt-5-nano",
						"status":   "Available",
						"lifecycle": map[string]any{
							"status": "active",
						},
					},
				},
			})
		case "/responses":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":    "resp_1",
				"model": "openai/gpt-5-nano",
				"usage": map[string]any{
					"input_tokens":  2,
					"output_tokens": 1,
					"total_tokens":  3,
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	directory := filepath.Join(t.TempDir(), "devtools")
	client := New(
		"test",
		server.URL,
		WithDeprecationWarnings(false),
		WithDevtools(CreateAIStatsDevtools(
			WithDevtoolsDirectory(directory),
			WithDevtoolsEnabled(true),
		)),
	)

	_, err := client.CreateResponse(context.Background(), gen.ResponsesRequest{
		Model: "openai/gpt-5-nano",
		Input: "hi",
	})
	if err != nil {
		t.Fatalf("CreateResponse failed: %v", err)
	}

	metadataPath := filepath.Join(directory, "metadata.json")
	if _, err := os.Stat(metadataPath); err != nil {
		t.Fatalf("metadata file missing: %v", err)
	}

	generationsPath := filepath.Join(directory, "generations.jsonl")
	data, err := os.ReadFile(generationsPath)
	if err != nil {
		t.Fatalf("generations file missing: %v", err)
	}
	content := strings.TrimSpace(string(data))
	if content == "" {
		t.Fatal("expected telemetry entries")
	}
	if !strings.Contains(content, "\"type\":\"responses\"") {
		t.Fatalf("expected responses entry, got %s", content)
	}
	if !strings.Contains(content, "\"sdk\":\"go\"") {
		t.Fatalf("expected go sdk metadata, got %s", content)
	}
}
