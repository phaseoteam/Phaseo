package aistats

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetApiKeyReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/keys/key_123" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"id":"key_123","hash":"keyhash_123","status":"active"}}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.GetApiKey(context.Background(), "key_123")
	if err != nil {
		t.Fatalf("GetApiKey failed: %v", err)
	}

	payload, ok := response.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type: %#v", response)
	}
	data, ok := payload["data"].(map[string]any)
	if !ok || data["id"] != "key_123" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}
