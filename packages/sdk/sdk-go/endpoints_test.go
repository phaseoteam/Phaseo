package phaseo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListEndpointsReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/endpoints" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"endpoints":["chat/completions","responses","files"],"sample_models":["openai/gpt-5-nano"]}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.ListEndpoints(context.Background())
	if err != nil {
		t.Fatalf("ListEndpoints failed: %v", err)
	}

	payload, ok := response.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type: %#v", response)
	}
	if payload["ok"] != true {
		t.Fatalf("expected ok=true payload: %#v", payload)
	}
}
