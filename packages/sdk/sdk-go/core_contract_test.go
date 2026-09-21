package phaseo

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	gen "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3/src/gen"
)

func TestGeneratedTransportCoreContract(t *testing.T) {
	var reads atomic.Int32
	var writes atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/read":
			if reads.Add(1) == 1 {
				w.Header().Set("Retry-After", "0")
				w.WriteHeader(http.StatusTooManyRequests)
				return
			}
			w.Header().Set("X-Request-Id", "req_go_core")
			_, _ = w.Write([]byte(`{"ok":true}`))
		case "/write":
			writes.Add(1)
			if got := r.Header.Get("Idempotency-Key"); got != "idem_go" {
				t.Fatalf("expected idempotency header, got %q", got)
			}
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error":{"code":"temporarily_unavailable"}}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	client := gen.NewClient(server.URL)
	client.MaxRetries = 2
	var requests, responses, retries atomic.Int32
	client.OnRequest = func(gen.RequestEvent) { requests.Add(1) }
	client.OnResponse = func(gen.ResponseEvent) { responses.Add(1) }
	client.OnRetry = func(gen.RetryEvent) { retries.Add(1) }

	response, err := client.RequestWithOptions("GET", "/read", nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if reads.Load() != 2 || retries.Load() != 1 {
		t.Fatalf("expected one safe-read retry, reads=%d retries=%d", reads.Load(), retries.Load())
	}
	if response.RequestID() != "req_go_core" || response.TraceURL() == "" {
		t.Fatalf("missing response metadata: %#v", response)
	}

	_, err = client.RequestWithOptions("POST", "/write", nil, map[string]any{"model": "test"}, &gen.RequestOptions{IdempotencyKey: "idem_go"})
	var apiErr *gen.HTTPError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected HTTPError, got %T", err)
	}
	if writes.Load() != 1 {
		t.Fatalf("paid write was retried %d times", writes.Load())
	}
	if apiErr.Code != "temporarily_unavailable" || apiErr.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("missing structured error metadata: %#v", apiErr)
	}
	if requests.Load() != 3 || responses.Load() != 2 {
		t.Fatalf("unexpected hook counts: requests=%d responses=%d", requests.Load(), responses.Load())
	}
}

func TestGeneratedTransportHonoursDeadline(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(100 * time.Millisecond)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	client := gen.NewClient(server.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	_, err := client.RequestWithOptions("GET", "/slow", nil, nil, &gen.RequestOptions{Context: ctx})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline exceeded, got %v", err)
	}
}
