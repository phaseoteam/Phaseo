package phaseo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCalculatePricingReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/pricing/calculate" {
			http.NotFound(w, r)
			return
		}
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if got := body["provider"]; got != "openai" {
			t.Fatalf("unexpected provider: %#v", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"pricing":{"total_cost_usd":0.00025,"currency":"USD"}}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.CalculatePricing(context.Background(), map[string]interface{}{
		"provider": "openai",
		"model":    "openai/gpt-5-mini",
		"endpoint": "responses",
		"usage": map[string]interface{}{
			"input_tokens": 1000,
		},
	})
	if err != nil {
		t.Fatalf("CalculatePricing failed: %v", err)
	}

	payload, ok := response.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type: %#v", response)
	}
	if payload["ok"] != true {
		t.Fatalf("expected ok=true payload: %#v", payload)
	}
}
