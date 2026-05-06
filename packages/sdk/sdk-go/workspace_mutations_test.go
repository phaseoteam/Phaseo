package aistats

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWorkspaceMutationsReturnPayloads(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/workspaces":
			_, _ = w.Write([]byte(`{"data":{"id":"ws_123","slug":"sandbox","name":"Sandbox Workspace"}}`))
		case r.Method == http.MethodPatch && r.URL.Path == "/workspaces/ws_123":
			_, _ = w.Write([]byte(`{"data":{"id":"ws_123","slug":"sandbox","name":"Renamed Workspace","archived":true}}`))
		case r.Method == http.MethodDelete && r.URL.Path == "/workspaces/ws_123":
			_, _ = w.Write([]byte(`{"data":{"id":"ws_123","deleted":true}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))

	created, err := client.CreateWorkspace(context.Background(), map[string]interface{}{
		"name": "Sandbox Workspace",
		"slug": "sandbox",
	})
	if err != nil {
		t.Fatalf("CreateWorkspace failed: %v", err)
	}
	updated, err := client.UpdateWorkspace(context.Background(), "ws_123", map[string]interface{}{
		"name":     "Renamed Workspace",
		"archived": true,
	})
	if err != nil {
		t.Fatalf("UpdateWorkspace failed: %v", err)
	}
	deleted, err := client.DeleteWorkspace(context.Background(), "ws_123")
	if err != nil {
		t.Fatalf("DeleteWorkspace failed: %v", err)
	}

	createPayload := created.(map[string]any)
	updatePayload := updated.(map[string]any)
	deletePayload := deleted.(map[string]any)

	if createPayload["data"].(map[string]any)["id"] != "ws_123" {
		t.Fatalf("unexpected create payload: %#v", createPayload)
	}
	if updatePayload["data"].(map[string]any)["archived"] != true {
		t.Fatalf("unexpected update payload: %#v", updatePayload)
	}
	if deletePayload["data"].(map[string]any)["deleted"] != true {
		t.Fatalf("unexpected delete payload: %#v", deletePayload)
	}
}
