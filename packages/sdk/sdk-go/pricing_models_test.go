package aistats

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListPricingModelsReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/pricing/models" {
			http.NotFound(w, r)
			return
		}
		if got := r.URL.Query().Get("provider"); got != "openai" {
			t.Fatalf("unexpected provider: %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"models":[{"provider":"openai","model":"openai/gpt-5-mini","endpoint":"responses","display_name":"GPT-5 Mini","meters":[{"meter":"input_tokens","unit":"tokens","unit_size":1000,"price_per_unit":"0.00025","currency":"USD"}]}]}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.ListPricingModels(context.Background(), map[string]string{
		"provider": "openai",
	})
	if err != nil {
		t.Fatalf("ListPricingModels failed: %v", err)
	}

	payload, ok := response.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type: %#v", response)
	}
	if payload["ok"] != true {
		t.Fatalf("expected ok=true payload: %#v", payload)
	}
}
