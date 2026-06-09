package aistats

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListTeamModelsReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/models" {
			http.NotFound(w, r)
			return
		}
		if got := r.URL.Query().Get("limit"); got != "2" {
			t.Fatalf("expected limit=2, got %q", got)
		}
		if got := r.URL.Query().Get("endpoints"); got != "responses" {
			t.Fatalf("expected endpoints=responses, got %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"limit":2,"models":[{"id":"openai/gpt-5-mini","endpoints":["responses"]}]}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.ListTeamModels(context.Background(), map[string]string{
		"limit":     "2",
		"endpoints": "responses",
	})
	if err != nil {
		t.Fatalf("ListTeamModels failed: %v", err)
	}

	payload, ok := response.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type: %#v", response)
	}
	if payload["ok"] != true {
		t.Fatalf("expected ok=true payload: %#v", payload)
	}
}
