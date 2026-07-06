package phaseo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListWorkspacesReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/workspaces" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("limit") != "2" || r.URL.Query().Get("offset") != "3" {
			t.Fatalf("unexpected query params: %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"ws_123","slug":"default"},{"id":"ws_456","slug":"sandbox"}]}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.ListWorkspaces(context.Background(), map[string]string{
		"limit":  "2",
		"offset": "3",
	})
	if err != nil {
		t.Fatalf("ListWorkspaces failed: %v", err)
	}

	payload, ok := response.(map[string]any)
	if !ok || payload["object"] != "list" {
		t.Fatalf("unexpected payload: %#v", response)
	}
}

func TestGetWorkspaceReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/workspaces/ws_123" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"id":"ws_123","slug":"default","name":"Default Workspace"}}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.GetWorkspace(context.Background(), "ws_123")
	if err != nil {
		t.Fatalf("GetWorkspace failed: %v", err)
	}

	payload, ok := response.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type: %#v", response)
	}
	data, ok := payload["data"].(map[string]any)
	if !ok || data["id"] != "ws_123" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}
