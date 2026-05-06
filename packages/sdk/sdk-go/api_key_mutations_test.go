package aistats

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestApiKeyMutationsReturnPayloads(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/keys":
			_, _ = w.Write([]byte(`{"data":{"id":"key_123","name":"Admin Key","status":"active"}}`))
		case r.Method == http.MethodPatch && r.URL.Path == "/keys/key_123":
			_, _ = w.Write([]byte(`{"data":{"id":"key_123","name":"Renamed Key","status":"disabled"}}`))
		case r.Method == http.MethodDelete && r.URL.Path == "/keys/key_123":
			_, _ = w.Write([]byte(`{"data":{"id":"key_123","deleted":true}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))

	created, err := client.CreateApiKey(context.Background(), map[string]interface{}{
		"name":   "Admin Key",
		"scopes": []string{"gateway:read"},
	})
	if err != nil {
		t.Fatalf("CreateApiKey failed: %v", err)
	}
	updated, err := client.UpdateApiKey(context.Background(), "key_123", map[string]interface{}{
		"name":     "Renamed Key",
		"disabled": true,
	})
	if err != nil {
		t.Fatalf("UpdateApiKey failed: %v", err)
	}
	deleted, err := client.DeleteApiKey(context.Background(), "key_123")
	if err != nil {
		t.Fatalf("DeleteApiKey failed: %v", err)
	}

	createPayload := created.(map[string]any)
	updatePayload := updated.(map[string]any)
	deletePayload := deleted.(map[string]any)

	if createPayload["data"].(map[string]any)["id"] != "key_123" {
		t.Fatalf("unexpected create payload: %#v", createPayload)
	}
	if updatePayload["data"].(map[string]any)["status"] != "disabled" {
		t.Fatalf("unexpected update payload: %#v", updatePayload)
	}
	if deletePayload["data"].(map[string]any)["deleted"] != true {
		t.Fatalf("unexpected delete payload: %#v", deletePayload)
	}
}
