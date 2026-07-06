package phaseo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetCurrentApiKeyReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/key" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"id":"key_123","prefix":"phaseo_v1_sk_test","status":"active"}}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.GetCurrentApiKey(context.Background())
	if err != nil {
		t.Fatalf("GetCurrentApiKey failed: %v", err)
	}

	payload, ok := response.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type: %#v", response)
	}
	data, ok := payload["data"].(map[string]any)
	if !ok || data["id"] != "key_123" {
		t.Fatalf("unexpected current key payload: %#v", payload)
	}
}
