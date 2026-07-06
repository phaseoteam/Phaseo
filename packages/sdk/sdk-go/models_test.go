package phaseo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetModelsPreservesAvailabilityReason(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/models" {
			http.NotFound(w, r)
			return
		}
		if got := r.URL.Query().Get("availability"); got != "all" {
			t.Fatalf("expected availability=all, got %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"availability_mode":"all","models":[{"id":"openai/gpt-5-mini","providers":[{"api_provider_id":"openai","availability_status":"coming_soon","availability_reason":"scheduled"}]}]}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.GetModels(context.Background(), map[string]string{
		"availability": "all",
	})
	if err != nil {
		t.Fatalf("GetModels failed: %v", err)
	}

	if response["availability_mode"] != "all" {
		t.Fatalf("expected availability_mode=all payload: %#v", response)
	}
	models, ok := response["models"].([]any)
	if !ok || len(models) != 1 {
		t.Fatalf("unexpected models payload: %#v", response["models"])
	}
	model, ok := models[0].(map[string]any)
	if !ok {
		t.Fatalf("unexpected model payload: %#v", models[0])
	}
	providers, ok := model["providers"].([]any)
	if !ok || len(providers) != 1 {
		t.Fatalf("unexpected providers payload: %#v", model["providers"])
	}
	provider, ok := providers[0].(map[string]any)
	if !ok {
		t.Fatalf("unexpected provider payload: %#v", providers[0])
	}
	if provider["availability_status"] != "coming_soon" {
		t.Fatalf("unexpected availability_status: %#v", provider)
	}
	if provider["availability_reason"] != "scheduled" {
		t.Fatalf("unexpected availability_reason: %#v", provider)
	}
}
