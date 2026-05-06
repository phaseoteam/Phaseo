package aistats

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListOrganisationsReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/organisations" {
			http.NotFound(w, r)
			return
		}
		if got := r.URL.Query().Get("limit"); got != "2" {
			t.Fatalf("unexpected limit: %q", got)
		}
		if got := r.URL.Query().Get("offset"); got != "3" {
			t.Fatalf("unexpected offset: %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"limit":2,"offset":3,"total":1,"organisations":[{"organisation_id":"org_123","name":"Anthropic","country_code":"US","colour":"#D97706"}]}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.ListOrganisations(context.Background(), map[string]string{
		"limit":  "2",
		"offset": "3",
	})
	if err != nil {
		t.Fatalf("ListOrganisations failed: %v", err)
	}

	payload, ok := response.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type: %#v", response)
	}
	if payload["ok"] != true {
		t.Fatalf("expected ok=true payload: %#v", payload)
	}
}
