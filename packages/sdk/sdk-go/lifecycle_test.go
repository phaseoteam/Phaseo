package aistats

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	gen "github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go/src/gen"
)

func TestInactiveModelBlocksRequest(t *testing.T) {
	var dataModelsCalls int32
	var responsesCalls int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/data/models":
			atomic.AddInt32(&dataModelsCalls, 1)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"models": []map[string]any{
					{
						"model_id": "provider/old-model",
						"lifecycle": map[string]any{
							"status":               "deprecated",
							"retirement_date":      "2099-01-01T00:00:00Z",
							"replacement_model_id": "provider/new-model",
						},
					},
				},
			})
			return
		case "/responses":
			atomic.AddInt32(&responsesCalls, 1)
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "resp_1", "model": "provider/old-model"})
			return
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := New("test", server.URL, WithLogger(func(level AIStatsLogLevel, message string, _ map[string]any) {
		_ = level
		_ = message
	}))

	req := gen.ResponsesRequest{
		Model: "provider/old-model",
		Input: "hello",
	}
	_, err := client.CreateResponse(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for inactive model")
	}
	if !strings.Contains(err.Error(), "provider/new-model") {
		t.Fatalf("expected replacement model in inactive-model error, got %q", err.Error())
	}
	if atomic.LoadInt32(&dataModelsCalls) != 1 {
		t.Fatalf("expected 1 /data/models lookup due to cache, got %d", dataModelsCalls)
	}
	if atomic.LoadInt32(&responsesCalls) != 0 {
		t.Fatalf("expected 0 /responses calls when lifecycle blocks request, got %d", responsesCalls)
	}
}

func TestRetiredModelBlocksRequestWithoutWarningsAsErrors(t *testing.T) {
	var responsesCalls int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/data/models":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"models": []map[string]any{
					{
						"model_id": "provider/retired-model",
						"lifecycle": map[string]any{
							"status":          "retired",
							"retirement_date": "2020-01-01T00:00:00Z",
						},
					},
				},
			})
			return
		case "/responses":
			atomic.AddInt32(&responsesCalls, 1)
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "resp_1"})
			return
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := New("test", server.URL, WithWarningsAsErrors(false))
	_, err := client.CreateResponse(context.Background(), gen.ResponsesRequest{
		Model: "provider/retired-model",
		Input: "hello",
	})
	if err == nil {
		t.Fatal("expected error when model is retired")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "retired") {
		t.Fatalf("expected retired model error, got %q", err.Error())
	}
	if atomic.LoadInt32(&responsesCalls) != 0 {
		t.Fatalf("expected no /responses call when blocked by lifecycle warning, got %d", responsesCalls)
	}
}
