package phaseo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/health" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","timestamp":"2026-05-05T12:00:00.000Z"}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.Health(context.Background())
	if err != nil {
		t.Fatalf("Health failed: %v", err)
	}

	if response["status"] != "ok" {
		t.Fatalf("unexpected health payload: %#v", response)
	}
}
