package phaseo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	gen "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/src/gen"
)

func TestDevtoolsCapturesResponsesRequests(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/models":
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
					"session_id": "session_go_chat_1",
					"upstream_request_id": "upstream_go_chat_1",
					"pricing_lines": []map[string]any{
						{"provider": "openai", "cost_usd": 0.0025},
					},
					"usage": map[string]any{
						"input_tokens":  2,
						"output_tokens": 1,
						"total_tokens":  3,
					},
					"request_id":          "req_go_1",
					"latency_ms":          120,
					"generation_ms":       340,
					"provider_attempts": []map[string]any{
						{
							"provider":    "openai",
							"status_code": 200,
							"duration_ms": 460,
						},
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
		WithDevtools(CreatePhaseoDevtools(
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

	var entry map[string]any
	if err := json.Unmarshal([]byte(content), &entry); err != nil {
		t.Fatalf("failed to parse telemetry entry: %v", err)
	}
	metadata, ok := entry["metadata"].(map[string]any)
	if !ok {
		t.Fatalf("expected metadata object, got %#v", entry["metadata"])
	}
	if metadata["request_id"] != "req_go_1" {
		t.Fatalf("expected request_id metadata, got %#v", metadata["request_id"])
	}
	if metadata["session_id"] != "session_go_chat_1" {
		t.Fatalf("expected session_id metadata, got %#v", metadata["session_id"])
	}
	if metadata["upstream_request_id"] != "upstream_go_chat_1" {
		t.Fatalf("expected upstream_request_id metadata, got %#v", metadata["upstream_request_id"])
	}
	if pricingLines, ok := metadata["pricing_lines"].([]any); !ok || len(pricingLines) != 1 {
		t.Fatalf("expected pricing_lines metadata, got %#v", metadata["pricing_lines"])
	}
	if metadata["latency_ms"] != float64(120) {
		t.Fatalf("expected latency_ms metadata, got %#v", metadata["latency_ms"])
	}
	attempts, ok := metadata["provider_attempts"].([]any)
	if !ok || len(attempts) != 1 {
		t.Fatalf("expected provider_attempts metadata, got %#v", metadata["provider_attempts"])
	}
}

func TestDevtoolsCapturesBatchEntries(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/batches":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":         "batch_go_1",
				"object":     "batch",
				"status":     "completed",
				"endpoint":   "/v1/responses",
				"provider":   "openai",
				"request_id": "req_go_batch_1",
				"session_id": "session_go_batch_1",
				"pricing_lines": []map[string]any{
					{"dimension": "batch_requests", "units": 2},
				},
				"request_counts": map[string]any{
					"total":     2,
					"completed": 1,
					"failed":    1,
				},
				"billing": map[string]any{
					"charged":    true,
					"cost_usd":   0.0025,
					"cost_nanos": 2500000,
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
		WithDevtools(CreatePhaseoDevtools(
			WithDevtoolsDirectory(directory),
			WithDevtoolsEnabled(true),
		)),
	)

	_, err := client.CreateBatch(context.Background(), map[string]any{
		"input_file_id":      "file_go_1",
		"endpoint":           "/v1/responses",
		"completion_window":  "24h",
		"session_id":         "session_go_batch_1",
		"webhook":            map[string]any{"url": "https://example.com/hooks/batch"},
	})
	if err != nil {
		t.Fatalf("CreateBatch failed: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(directory, "generations.jsonl"))
	if err != nil {
		t.Fatalf("generations file missing: %v", err)
	}
	var entry map[string]any
	if err := json.Unmarshal(data, &entry); err != nil {
		t.Fatalf("failed to parse telemetry entry: %v", err)
	}
	if entry["type"] != "batches.create" {
		t.Fatalf("expected batches.create type, got %#v", entry["type"])
	}
	request, ok := entry["request"].(map[string]any)
	if !ok {
		t.Fatalf("expected request payload, got %#v", entry["request"])
	}
	if request["session_id"] != "session_go_batch_1" {
		t.Fatalf("expected request session_id, got %#v", request["session_id"])
	}
	metadata, ok := entry["metadata"].(map[string]any)
	if !ok {
		t.Fatalf("expected metadata object, got %#v", entry["metadata"])
	}
	if metadata["provider"] != "openai" {
		t.Fatalf("expected provider metadata, got %#v", metadata["provider"])
	}
	if metadata["session_id"] != "session_go_batch_1" {
		t.Fatalf("expected session_id metadata, got %#v", metadata["session_id"])
	}
	requestCounts, ok := metadata["request_counts"].(map[string]any)
	if !ok || requestCounts["total"] != float64(2) {
		t.Fatalf("expected request_counts metadata, got %#v", metadata["request_counts"])
	}
	billing, ok := metadata["billing"].(map[string]any)
	if !ok || billing["charged"] != true {
		t.Fatalf("expected billing metadata, got %#v", metadata["billing"])
	}
}

func TestDevtoolsCapturesHealthEntries(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":    "ok",
				"timestamp": "2026-05-05T12:00:00.000Z",
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
		WithDevtools(CreatePhaseoDevtools(
			WithDevtoolsDirectory(directory),
			WithDevtoolsEnabled(true),
		)),
	)

	response, err := client.Health(context.Background())
	if err != nil {
		t.Fatalf("Health failed: %v", err)
	}
	if response["status"] != "ok" {
		t.Fatalf("unexpected health payload: %#v", response)
	}

	data, err := os.ReadFile(filepath.Join(directory, "generations.jsonl"))
	if err != nil {
		t.Fatalf("generations file missing: %v", err)
	}
	content := strings.TrimSpace(string(data))
	if !strings.Contains(content, "\"type\":\"health\"") {
		t.Fatalf("expected health entry, got %s", content)
	}
	if !strings.Contains(content, "\"status\":\"ok\"") {
		t.Fatalf("expected health response payload, got %s", content)
	}
}

func TestDevtoolsCapturesControlPlaneEntries(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/models":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"models": []map[string]any{
					{"model_id": "openai/gpt-5-mini"},
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/providers":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"providers": []map[string]any{
					{"provider_id": "openai", "name": "OpenAI"},
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/credits":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"credits": map[string]any{"balance_usd": 42.5},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/activity":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"ok": true,
				"total": 1,
				"activity": []map[string]any{
					{"request_id": "req_go_activity_1"},
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/analytics":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": []map[string]any{
					{"date": "2026-05-01", "endpoint_id": "responses", "requests": 12},
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/endpoints":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": []map[string]any{
					{"id": "responses", "path": "/responses"},
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/organisations":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"total": 1,
				"organisations": []map[string]any{
					{"organisation_id": "org_go_1", "name": "Anthropic"},
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/pricing/models":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"models": []map[string]any{
					{"provider": "openai", "model": "openai/gpt-5-mini"},
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/pricing/calculate":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"pricing": map[string]any{
					"total_cost_usd": 0.00025,
					"currency":       "USD",
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/keys":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"object": "list",
				"data": []map[string]any{
					{"id": "key_go_1", "status": "active"},
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/key":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": map[string]any{
					"id":     "key_go_1",
					"status": "active",
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/workspaces":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"object": "list",
				"data": []map[string]any{
					{"id": "ws_go_1"},
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
		WithDevtools(CreatePhaseoDevtools(
			WithDevtoolsDirectory(directory),
			WithDevtoolsEnabled(true),
		)),
	)

	if _, err := client.GetModels(context.Background(), map[string]string{"limit": "2"}); err != nil {
		t.Fatalf("GetModels failed: %v", err)
	}
	if _, err := client.ListProviders(context.Background(), map[string]string{"limit": "2"}); err != nil {
		t.Fatalf("ListProviders failed: %v", err)
	}
	if _, err := client.GetCredits(context.Background(), map[string]string{"team_id": "team_123"}); err != nil {
		t.Fatalf("GetCredits failed: %v", err)
	}
	if _, err := client.GetActivity(context.Background(), map[string]string{"days": "30"}); err != nil {
		t.Fatalf("GetActivity failed: %v", err)
	}
	if _, err := client.GetAnalytics(context.Background(), map[string]string{"date": "2026-05-01"}); err != nil {
		t.Fatalf("GetAnalytics failed: %v", err)
	}
	if _, err := client.ListEndpoints(context.Background()); err != nil {
		t.Fatalf("ListEndpoints failed: %v", err)
	}
	if _, err := client.ListOrganisations(context.Background(), map[string]string{"limit": "2", "offset": "3"}); err != nil {
		t.Fatalf("ListOrganisations failed: %v", err)
	}
	if _, err := client.ListPricingModels(context.Background(), map[string]string{"provider": "openai"}); err != nil {
		t.Fatalf("ListPricingModels failed: %v", err)
	}
	if _, err := client.CalculatePricing(context.Background(), map[string]any{
		"provider": "openai",
		"model":    "openai/gpt-5-mini",
		"endpoint": "responses",
	}); err != nil {
		t.Fatalf("CalculatePricing failed: %v", err)
	}
	if _, err := client.ListApiKeys(context.Background(), map[string]string{"disabled": "true", "limit": "2"}); err != nil {
		t.Fatalf("ListApiKeys failed: %v", err)
	}
	if _, err := client.GetCurrentApiKey(context.Background()); err != nil {
		t.Fatalf("GetCurrentApiKey failed: %v", err)
	}
	if _, err := client.ListWorkspaces(context.Background(), map[string]string{"limit": "2"}); err != nil {
		t.Fatalf("ListWorkspaces failed: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(directory, "generations.jsonl"))
	if err != nil {
		t.Fatalf("generations file missing: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) != 12 {
		t.Fatalf("expected 12 telemetry entries, got %d", len(lines))
	}

	var parsed []map[string]any
	for _, line := range lines {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatalf("failed to parse telemetry entry: %v", err)
		}
		parsed = append(parsed, entry)
	}

	expectedTypes := []string{
		"models.list",
		"providers",
		"credits",
		"activity",
		"analytics",
		"endpoints.list",
		"organisations.list",
		"pricing.models",
		"pricing.calculate",
		"provisioning.keys.list",
		"key.current",
		"provisioning.workspaces.list",
	}
	for idx, expected := range expectedTypes {
		if parsed[idx]["type"] != expected {
			t.Fatalf("expected entry %d type %q, got %#v", idx, expected, parsed[idx]["type"])
		}
	}
	if request, ok := parsed[0]["request"].(map[string]any); !ok || request["limit"] != "2" {
		t.Fatalf("expected models request payload, got %#v", parsed[0]["request"])
	}
	if response, ok := parsed[4]["response"].(map[string]any); !ok || response["data"] == nil {
		t.Fatalf("expected analytics response payload, got %#v", parsed[4]["response"])
	}
	if response, ok := parsed[8]["response"].(map[string]any); !ok || response["pricing"] == nil {
		t.Fatalf("expected pricing.calculate response payload, got %#v", parsed[8]["response"])
	}
	if response, ok := parsed[10]["response"].(map[string]any); !ok || response["data"] == nil {
		t.Fatalf("expected key.current response payload, got %#v", parsed[10]["response"])
	}
}

func TestDevtoolsCapturesRoutingMetadataFromHTTPErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/models":
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
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":      "rate limited",
				"request_id": "req_go_err_1",
				"provider_attempts": []map[string]any{
					{
						"provider":    "openrouter",
						"status_code": 429,
						"duration_ms": 612,
					},
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
		WithDevtools(CreatePhaseoDevtools(
			WithDevtoolsDirectory(directory),
			WithDevtoolsEnabled(true),
		)),
	)

	_, err := client.CreateResponse(context.Background(), gen.ResponsesRequest{
		Model: "openai/gpt-5-nano",
		Input: "hi",
	})
	if err == nil {
		t.Fatal("expected CreateResponse to fail")
	}

	data, err := os.ReadFile(filepath.Join(directory, "generations.jsonl"))
	if err != nil {
		t.Fatalf("generations file missing: %v", err)
	}
	var entry map[string]any
	if err := json.Unmarshal(data, &entry); err != nil {
		t.Fatalf("failed to parse telemetry entry: %v", err)
	}
	if response, ok := entry["response"].(map[string]any); !ok || response["request_id"] != "req_go_err_1" {
		t.Fatalf("expected structured error response, got %#v", entry["response"])
	}
	metadata, ok := entry["metadata"].(map[string]any)
	if !ok || metadata["request_id"] != "req_go_err_1" {
		t.Fatalf("expected metadata to preserve request_id, got %#v", entry["metadata"])
	}
}

func TestDevtoolsCapturesGenerationLookupEntries(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/generations":
			if r.Method != http.MethodGet {
				t.Fatalf("expected GET /generations, got %s", r.Method)
			}
			if r.URL.Query().Get("id") != "gen_go_1" {
				t.Fatalf("expected generation id query, got %q", r.URL.Query().Get("id"))
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":         "gen_go_1",
				"provider":   "openai",
				"request_id": "req_go_generation_1",
				"session_id": "session_go_generation_1",
				"status_code": 200,
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
		WithDevtools(CreatePhaseoDevtools(
			WithDevtoolsDirectory(directory),
			WithDevtoolsEnabled(true),
		)),
	)

	_, err := client.GetGeneration(context.Background(), "gen_go_1")
	if err != nil {
		t.Fatalf("GetGeneration failed: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(directory, "generations.jsonl"))
	if err != nil {
		t.Fatalf("generations file missing: %v", err)
	}
	var entry map[string]any
	if err := json.Unmarshal(data, &entry); err != nil {
		t.Fatalf("failed to parse telemetry entry: %v", err)
	}
	if entry["type"] != "generations.retrieve" {
		t.Fatalf("expected generations.retrieve type, got %#v", entry["type"])
	}
	request, ok := entry["request"].(map[string]any)
	if !ok || request["id"] != "gen_go_1" {
		t.Fatalf("expected generation lookup request payload, got %#v", entry["request"])
	}
	metadata, ok := entry["metadata"].(map[string]any)
	if !ok {
		t.Fatalf("expected metadata object, got %#v", entry["metadata"])
	}
	if metadata["request_id"] != "req_go_generation_1" {
		t.Fatalf("expected request_id metadata, got %#v", metadata["request_id"])
	}
	if metadata["session_id"] != "session_go_generation_1" {
		t.Fatalf("expected session_id metadata, got %#v", metadata["session_id"])
	}
	if metadata["provider"] != "openai" {
		t.Fatalf("expected provider metadata, got %#v", metadata["provider"])
	}
}

func TestDevtoolsCapturesVideoLifecycleEntries(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/models":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"models": []map[string]any{
					{
						"model_id": "google/veo-3",
						"status":   "active",
					},
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/videos":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":         "video_go_1",
				"object":     "video",
				"status":     "queued",
				"provider":   "google",
				"model":      "google/veo-3",
				"request_id": "req_go_video_1",
				"session_id": "session_go_video_1",
			})
		case r.Method == http.MethodGet && r.URL.Path == "/videos/video_go_1":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":         "video_go_1",
				"object":     "video",
				"status":     "completed",
				"provider":   "google",
				"model":      "google/veo-3",
				"request_id": "req_go_video_2",
				"session_id": "session_go_video_2",
			})
		case r.Method == http.MethodPost && r.URL.Path == "/videos/video_go_1/cancel":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":         "video_go_1",
				"object":     "video",
				"status":     "cancelled",
				"provider":   "google",
				"model":      "google/veo-3",
				"request_id": "req_go_video_3",
				"session_id": "session_go_video_3",
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
		WithDevtools(CreatePhaseoDevtools(
			WithDevtoolsDirectory(directory),
			WithDevtoolsEnabled(true),
		)),
	)

	_, err := client.CreateVideo(context.Background(), map[string]any{
		"model":  "google/veo-3",
		"prompt": "orbital reveal",
	})
	if err != nil {
		t.Fatalf("CreateVideo failed: %v", err)
	}
	_, err = client.GetVideo(context.Background(), "video_go_1")
	if err != nil {
		t.Fatalf("GetVideo failed: %v", err)
	}
	_, err = client.CancelVideo(context.Background(), "video_go_1")
	if err != nil {
		t.Fatalf("CancelVideo failed: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(directory, "generations.jsonl"))
	if err != nil {
		t.Fatalf("generations file missing: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) != 3 {
		t.Fatalf("expected 3 telemetry entries, got %d", len(lines))
	}

	var createEntry map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &createEntry); err != nil {
		t.Fatalf("failed to parse create telemetry entry: %v", err)
	}
	if createEntry["type"] != "video.generations" {
		t.Fatalf("expected video.generations type, got %#v", createEntry["type"])
	}
	if metadata, ok := createEntry["metadata"].(map[string]any); !ok || metadata["provider"] != "google" || metadata["request_id"] != "req_go_video_1" {
		t.Fatalf("expected create metadata, got %#v", createEntry["metadata"])
	}

	var retrieveEntry map[string]any
	if err := json.Unmarshal([]byte(lines[1]), &retrieveEntry); err != nil {
		t.Fatalf("failed to parse retrieve telemetry entry: %v", err)
	}
	if retrieveEntry["type"] != "video.retrieve" {
		t.Fatalf("expected video.retrieve type, got %#v", retrieveEntry["type"])
	}
	if request, ok := retrieveEntry["request"].(map[string]any); !ok || request["video_id"] != "video_go_1" {
		t.Fatalf("expected retrieve request payload, got %#v", retrieveEntry["request"])
	}
	if metadata, ok := retrieveEntry["metadata"].(map[string]any); !ok || metadata["session_id"] != "session_go_video_2" {
		t.Fatalf("expected retrieve metadata, got %#v", retrieveEntry["metadata"])
	}

	var cancelEntry map[string]any
	if err := json.Unmarshal([]byte(lines[2]), &cancelEntry); err != nil {
		t.Fatalf("failed to parse cancel telemetry entry: %v", err)
	}
	if cancelEntry["type"] != "video.cancel" {
		t.Fatalf("expected video.cancel type, got %#v", cancelEntry["type"])
	}
	if metadata, ok := cancelEntry["metadata"].(map[string]any); !ok || metadata["request_id"] != "req_go_video_3" {
		t.Fatalf("expected cancel metadata, got %#v", cancelEntry["metadata"])
	}
}
