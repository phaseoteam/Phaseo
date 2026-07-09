package phaseo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetGenerationReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/generations" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("id") != "gen_123" {
			t.Fatalf("unexpected generation id query: %q", r.URL.Query().Get("id"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"gen_123","provider":"openai","request_id":"req_go_generation_1","status_code":200,"replay_supported":true,"replay_request":{"model":"openai/gpt-5-nano","messages":[{"role":"user","content":"hello"}]}}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.GetGeneration(context.Background(), "gen_123")
	if err != nil {
		t.Fatalf("GetGeneration failed: %v", err)
	}
	if response["id"] != "gen_123" || response["provider"] != "openai" || response["request_id"] != "req_go_generation_1" {
		t.Fatalf("unexpected generation payload: %#v", response)
	}
	if response["replay_supported"] != true {
		t.Fatalf("expected replay_supported=true, got %#v", response["replay_supported"])
	}
}
