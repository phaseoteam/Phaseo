package phaseo

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// A server that answers only once the request is abandoned, so a helper returns early only
// if the caller's context reaches the HTTP request.
func newHangingServer(t *testing.T) *httptest.Server {
	t.Helper()
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	t.Cleanup(func() {
		close(release)
		server.Close()
	})
	return server
}

func TestHelpersStopWhenCallerContextEnds(t *testing.T) {
	server := newHangingServer(t)
	client := New("test", server.URL, WithDeprecationWarnings(false), WithTimeout(10*time.Second))

	calls := map[string]func(ctx context.Context) error{
		"GetModels": func(ctx context.Context) error {
			_, err := client.GetModels(ctx, nil)
			return err
		},
		"Health": func(ctx context.Context) error {
			_, err := client.Health(ctx)
			return err
		},
		"GetGeneration": func(ctx context.Context) error {
			_, err := client.GetGeneration(ctx, "gen_123")
			return err
		},
		"RetrieveFileContent": func(ctx context.Context) error {
			_, err := client.RetrieveFileContent(ctx, "file_123")
			return err
		},
		"CreateChatCompletion": func(ctx context.Context) error {
			_, err := client.CreateChatCompletion(ctx, ChatCompletionsRequest{Model: "openai/gpt-5-nano"})
			return err
		},
	}

	for name, call := range calls {
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
			defer cancel()
			started := time.Now()
			err := call(ctx)
			if elapsed := time.Since(started); elapsed > 2*time.Second {
				t.Fatalf("%s ignored the context deadline and ran for %s", name, elapsed)
			}
			if !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("%s error = %v, want context.DeadlineExceeded", name, err)
			}
		})
	}
}

func TestRawClientWithContextKeepsTheOriginalUnchanged(t *testing.T) {
	client := New("test", "https://example.invalid/v1")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	scoped := client.RawClient().WithContext(ctx)
	if scoped == client.RawClient() {
		t.Fatal("WithContext must return a copy")
	}
	if scoped.BaseURL != client.RawClient().BaseURL || scoped.Headers["Authorization"] != "Bearer test" {
		t.Fatal("WithContext copy lost the client configuration")
	}
}
