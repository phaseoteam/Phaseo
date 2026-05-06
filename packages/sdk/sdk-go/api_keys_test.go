package aistats

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListApiKeysReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/keys" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("disabled") != "true" || r.URL.Query().Get("limit") != "2" {
			t.Fatalf("unexpected query params: %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"key_123","status":"active"},{"id":"key_456","status":"disabled"}]}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.ListApiKeys(context.Background(), map[string]string{
		"disabled": "true",
		"limit":    "2",
	})
	if err != nil {
		t.Fatalf("ListApiKeys failed: %v", err)
	}

	payload, ok := response.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type: %#v", response)
	}
	if payload["object"] != "list" {
		t.Fatalf("expected object=list payload: %#v", payload)
	}
}
