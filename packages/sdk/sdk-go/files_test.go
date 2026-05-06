package aistats

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRetrieveFileContentReturnsBytes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/files/file_123/content" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/jsonl")
		_, _ = w.Write([]byte("{\"ok\":true}\n"))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	content, err := client.RetrieveFileContent(context.Background(), "file_123")
	if err != nil {
		t.Fatalf("RetrieveFileContent failed: %v", err)
	}
	if string(content) != "{\"ok\":true}\n" {
		t.Fatalf("unexpected file content: %q", string(content))
	}
}
