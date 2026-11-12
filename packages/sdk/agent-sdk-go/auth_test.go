package phaseoagent

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

func TestGatewayAgentClientPassesAPIKeyProviderThrough(t *testing.T) {
	var mu sync.Mutex
	seen := map[string][]string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen[r.URL.Path] = append(seen[r.URL.Path], r.Header.Get("Authorization"))
		mu.Unlock()
		switch r.URL.Path {
		case "/models":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"models":[{"model_id":"openai/gpt-5-nano","status":"active"}]}`))
		case "/responses":
			if r.Header.Get("Accept") == "text/event-stream" {
				w.Header().Set("Content-Type", "text/event-stream")
				_, _ = w.Write([]byte("data: {\"type\":\"response.output_text.delta\",\"delta\":\"hi\"}\n\ndata: [DONE]\n\n"))
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"resp_1","object":"response","model":"openai/gpt-5-nano","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hi"}]}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	t.Setenv("PHASEO_API_KEY", "")
	var calls int32
	client, err := CreateGatewayAgentClient(GatewayAgentClientOptions{
		BaseURL: server.URL,
		Model:   "openai/gpt-5-nano",
		APIKeyProvider: func(context.Context) (string, error) {
			return fmt.Sprintf("workload-token-%d", atomic.AddInt32(&calls, 1)), nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Generate(context.Background(), ModelRequest{Messages: []Message{{Role: "user", Content: "hi"}}}); err != nil {
		t.Fatalf("Generate failed: %v", err)
	}
	mu.Lock()
	generated := append([]string(nil), seen["/responses"]...)
	mu.Unlock()
	if len(generated) != 1 || !strings.HasPrefix(generated[0], "Bearer workload-token-") {
		t.Fatalf("expected provider credential on the core client request, got %#v", generated)
	}

	for event := range client.Stream(context.Background(), ModelRequest{Messages: []Message{{Role: "user", Content: "hi"}}}) {
		if event.Err != nil {
			t.Fatalf("Stream failed: %v", event.Err)
		}
	}
	mu.Lock()
	streamed := append([]string(nil), seen["/responses"]...)
	mu.Unlock()
	if len(streamed) != 2 || streamed[1] == "" || streamed[1] == generated[0] {
		t.Fatalf("expected the stream request to ask the provider again, got %#v", streamed)
	}
}

func TestGatewayAgentClientStreamRejectsBlankProviderCredential(t *testing.T) {
	var requests int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&requests, 1)
	}))
	defer server.Close()
	client, err := CreateGatewayAgentClient(GatewayAgentClientOptions{
		BaseURL:        server.URL,
		APIKeyProvider: func(context.Context) (string, error) { return " ", nil },
	})
	if err != nil {
		t.Fatal(err)
	}
	var streamErr error
	for event := range client.Stream(context.Background(), ModelRequest{Messages: []Message{{Role: "user", Content: "hi"}}}) {
		if event.Err != nil {
			streamErr = event.Err
		}
	}
	if streamErr == nil || atomic.LoadInt32(&requests) != 0 {
		t.Fatalf("expected an error and no request, got err=%v requests=%d", streamErr, requests)
	}
}
