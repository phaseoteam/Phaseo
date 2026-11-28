package phaseo

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	gen "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v4/src/gen"
)

type authRecorder struct {
	mu      sync.Mutex
	headers []string
}

func (r *authRecorder) add(value string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.headers = append(r.headers, value)
}

func (r *authRecorder) all() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.headers...)
}

func newAuthServer(t *testing.T, statuses ...int) (*httptest.Server, *authRecorder) {
	t.Helper()
	recorder := &authRecorder{}
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recorder.add(r.Header.Get("Authorization"))
		index := int(atomic.AddInt32(&calls, 1)) - 1
		if index < len(statuses) {
			w.WriteHeader(statuses[index])
			_, _ = w.Write([]byte(`{"error":"retry"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(server.Close)
	return server, recorder
}

func sequenceProvider(values ...string) (APIKeyProvider, *int32) {
	var calls int32
	return func(context.Context) (string, error) {
		index := int(atomic.AddInt32(&calls, 1)) - 1
		if index >= len(values) {
			index = len(values) - 1
		}
		return values[index], nil
	}, &calls
}

func TestAPIKeyProviderIsCalledForEachRequest(t *testing.T) {
	server, recorder := newAuthServer(t)
	provider, calls := sequenceProvider(" token-1 ", "token-2")
	client := NewWithAPIKeyProvider(provider, server.URL, WithDeprecationWarnings(false))

	for i := 0; i < 2; i++ {
		if _, err := client.RequestWithResponse(context.Background(), http.MethodGet, "/credits", nil, nil, nil); err != nil {
			t.Fatalf("request %d failed: %v", i, err)
		}
	}
	got := recorder.all()
	if len(got) != 2 || got[0] != "Bearer token-1" || got[1] != "Bearer token-2" {
		t.Fatalf("expected two different bearer tokens, got %#v", got)
	}
	if atomic.LoadInt32(calls) != 2 {
		t.Fatalf("expected provider to be called twice, got %d", *calls)
	}
}

func TestAPIKeyProviderIsCalledAgainOnRetry(t *testing.T) {
	server, recorder := newAuthServer(t, http.StatusServiceUnavailable)
	provider, _ := sequenceProvider("first", "second")
	client := New("ignored-static-key", server.URL, WithAPIKeyProvider(provider), WithMaxRetries(1))

	if _, err := client.RequestWithResponse(context.Background(), http.MethodGet, "/credits", nil, nil, nil); err != nil {
		t.Fatalf("request failed: %v", err)
	}
	got := recorder.all()
	if len(got) != 2 || got[0] != "Bearer first" || got[1] != "Bearer second" {
		t.Fatalf("expected the retry to carry a fresh credential, got %#v", got)
	}
}

func TestAPIKeyProviderBlankCredentialIsNotSent(t *testing.T) {
	server, recorder := newAuthServer(t)
	client := NewWithAPIKeyProvider(func(context.Context) (string, error) { return "   ", nil }, server.URL)

	_, err := client.RequestWithResponse(context.Background(), http.MethodPost, "/responses", nil, map[string]any{"model": "x"}, nil)
	if !errors.Is(err, ErrEmptyAPIKey) {
		t.Fatalf("expected ErrEmptyAPIKey, got %v", err)
	}
	if got := recorder.all(); len(got) != 0 {
		t.Fatalf("expected no request to be sent, got %#v", got)
	}
}

func TestAPIKeyProviderErrorPropagates(t *testing.T) {
	server, recorder := newAuthServer(t)
	failure := errors.New("token service down")
	client := NewWithAPIKeyProvider(func(context.Context) (string, error) { return "", failure }, server.URL)

	_, err := client.RequestWithResponse(context.Background(), http.MethodPost, "/responses", nil, map[string]any{}, nil)
	if !errors.Is(err, failure) {
		t.Fatalf("expected provider error to propagate, got %v", err)
	}
	if got := recorder.all(); len(got) != 0 {
		t.Fatalf("expected no request to be sent, got %#v", got)
	}
}

func TestPerRequestAuthorizationSkipsAPIKeyProvider(t *testing.T) {
	server, recorder := newAuthServer(t)
	provider, calls := sequenceProvider("provider-token")
	client := NewWithAPIKeyProvider(provider, server.URL)

	_, err := client.RequestWithResponse(context.Background(), http.MethodGet, "/credits", nil, nil, &gen.RequestOptions{Headers: map[string]string{"Authorization": "Bearer explicit"}})
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if got := recorder.all(); len(got) != 1 || got[0] != "Bearer explicit" {
		t.Fatalf("expected the per-request header to win, got %#v", got)
	}
	if atomic.LoadInt32(calls) != 0 {
		t.Fatalf("expected provider not to be called, got %d calls", *calls)
	}
}

func TestAPIKeyProviderKeepsCustomHTTPClientUnchanged(t *testing.T) {
	server, recorder := newAuthServer(t)
	var used int32
	custom := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		atomic.AddInt32(&used, 1)
		return http.DefaultTransport.RoundTrip(r)
	})}
	original := custom.Transport
	client := New("", server.URL, WithAPIKeyProvider(func(context.Context) (string, error) { return "tok", nil }), WithHTTPClient(custom))

	if _, err := client.RequestWithResponse(context.Background(), http.MethodGet, "/credits", nil, nil, nil); err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if got := recorder.all(); len(got) != 1 || got[0] != "Bearer tok" {
		t.Fatalf("expected provider credential, got %#v", got)
	}
	if atomic.LoadInt32(&used) != 1 {
		t.Fatalf("expected the custom transport to be used")
	}
	if fmt.Sprintf("%p", custom.Transport) != fmt.Sprintf("%p", original) {
		t.Fatalf("expected caller's http.Client not to be modified")
	}
}

func TestStaticAPIKeyUnchanged(t *testing.T) {
	server, recorder := newAuthServer(t)
	client := New("static-key", server.URL)
	if _, err := client.RequestWithResponse(context.Background(), http.MethodGet, "/credits", nil, nil, nil); err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if got := recorder.all(); len(got) != 1 || got[0] != "Bearer static-key" {
		t.Fatalf("expected static bearer key, got %#v", got)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func testJWT(exp int64) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"exp":%d}`, exp)))
	return header + "." + payload + ".sig"
}

func envMap(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

func TestGitHubActionsTokenFetchesAndCaches(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	var fetches int32
	var lastQuery, lastAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&fetches, 1)
		lastQuery = r.URL.RawQuery
		lastAuth = r.Header.Get("Authorization")
		_ = json.NewEncoder(w).Encode(map[string]string{"value": testJWT(now.Unix() + 600 + int64(n))})
	}))
	defer server.Close()

	provider := GitHubActionsToken(GitHubActionsTokenOptions{
		Getenv: envMap(map[string]string{
			"ACTIONS_ID_TOKEN_REQUEST_URL":   server.URL + "/token?api-version=2.0",
			"ACTIONS_ID_TOKEN_REQUEST_TOKEN": "request-token",
		}),
		Now: func() time.Time { return now },
	})

	first, err := provider(context.Background())
	if err != nil {
		t.Fatalf("first token: %v", err)
	}
	if lastQuery != "api-version=2.0&audience=https%3A%2F%2Fapi.phaseo.app" {
		t.Fatalf("unexpected query %q", lastQuery)
	}
	if lastAuth != "bearer request-token" {
		t.Fatalf("unexpected authorization %q", lastAuth)
	}
	second, err := provider(context.Background())
	if err != nil || second != first || atomic.LoadInt32(&fetches) != 1 {
		t.Fatalf("expected cached token, fetches=%d err=%v", fetches, err)
	}

	now = now.Add(541 * time.Second) // within 60 seconds of exp
	third, err := provider(context.Background())
	if err != nil || third == first || atomic.LoadInt32(&fetches) != 2 {
		t.Fatalf("expected refetch near exp, fetches=%d err=%v", fetches, err)
	}
}

func TestGitHubActionsTokenCustomAudienceAndNoExp(t *testing.T) {
	var fetches int32
	var lastQuery string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&fetches, 1)
		lastQuery = r.URL.RawQuery
		_, _ = w.Write([]byte(`{"value":"opaque-token"}`))
	}))
	defer server.Close()
	provider := GitHubActionsToken(GitHubActionsTokenOptions{
		Audience: "custom aud",
		Getenv: envMap(map[string]string{
			"ACTIONS_ID_TOKEN_REQUEST_URL":   server.URL,
			"ACTIONS_ID_TOKEN_REQUEST_TOKEN": "rt",
		}),
	})
	for i := 0; i < 2; i++ {
		if token, err := provider(context.Background()); err != nil || token != "opaque-token" {
			t.Fatalf("token: %q %v", token, err)
		}
	}
	if lastQuery != "audience=custom+aud" {
		t.Fatalf("unexpected query %q", lastQuery)
	}
	if atomic.LoadInt32(&fetches) != 2 {
		t.Fatalf("expected no caching without exp, got %d fetches", fetches)
	}
}

func TestGitHubActionsTokenErrors(t *testing.T) {
	_, err := GitHubActionsToken(GitHubActionsTokenOptions{Getenv: envMap(nil)})(context.Background())
	if err == nil || !strings.Contains(err.Error(), "id-token: write") {
		t.Fatalf("expected id-token: write hint, got %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()
	_, err = GitHubActionsToken(GitHubActionsTokenOptions{Getenv: envMap(map[string]string{
		"ACTIONS_ID_TOKEN_REQUEST_URL":   server.URL,
		"ACTIONS_ID_TOKEN_REQUEST_TOKEN": "secret-request-token",
	})})(context.Background())
	if err == nil || !strings.Contains(err.Error(), "403") || strings.Contains(err.Error(), "secret-request-token") {
		t.Fatalf("expected status error without token, got %v", err)
	}
}

func TestVercelTokenExchangesAndCaches(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	var fetches int32
	var lastBody map[string]string
	var lastHeaders http.Header
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&fetches, 1)
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		lastHeaders = r.Header.Clone()
		data, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(data, &lastBody)
		_ = json.NewEncoder(w).Encode(map[string]any{"token": fmt.Sprintf("phaseo-token-%d", n), "expiry": now.Unix() + 300})
	}))
	defer server.Close()

	provider := VercelToken(VercelTokenOptions{
		ExchangeURL: server.URL,
		Getenv:      envMap(map[string]string{"VERCEL_OIDC_TOKEN_FILE": "/var/run/vercel/token"}),
		ReadFile: func(path string) ([]byte, error) {
			if path != "/var/run/vercel/token" {
				return nil, os.ErrNotExist
			}
			return []byte("  vercel-source\n"), nil
		},
		Now: func() time.Time { return now },
	})

	first, err := provider(context.Background())
	if err != nil || first != "phaseo-token-1" {
		t.Fatalf("first token: %q %v", first, err)
	}
	if lastBody["token"] != "vercel-source" || lastBody["aud"] != DefaultTrustedWorkloadAudience {
		t.Fatalf("unexpected exchange body %#v", lastBody)
	}
	if lastHeaders.Get("Content-Type") != "application/json" || lastHeaders.Get("Accept") != "application/json" {
		t.Fatalf("unexpected headers %#v", lastHeaders)
	}
	if second, _ := provider(context.Background()); second != first || atomic.LoadInt32(&fetches) != 1 {
		t.Fatalf("expected cached token, fetches=%d", fetches)
	}
	now = now.Add(241 * time.Second)
	if third, _ := provider(context.Background()); third != "phaseo-token-2" {
		t.Fatalf("expected refetch near expiry, got %q", third)
	}
}

func TestVercelTokenSources(t *testing.T) {
	var lastSource string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		lastSource = body["token"]
		_, _ = w.Write([]byte(`{"token":"exchanged"}`))
	}))
	defer server.Close()

	if _, err := VercelToken(VercelTokenOptions{ExchangeURL: server.URL, Getenv: envMap(map[string]string{"VERCEL_OIDC_TOKEN": "from-env"})})(context.Background()); err != nil || lastSource != "from-env" {
		t.Fatalf("env source: %q %v", lastSource, err)
	}
	header := "from-header"
	provider := VercelToken(VercelTokenOptions{ExchangeURL: server.URL, Getenv: envMap(nil), TokenProvider: func(context.Context) (string, error) { return header, nil }})
	if _, err := provider(context.Background()); err != nil || lastSource != "from-header" {
		t.Fatalf("provider source: %q %v", lastSource, err)
	}
	header = "next-header"
	if _, err := provider(context.Background()); err != nil || lastSource != "next-header" {
		t.Fatalf("expected new source token to bypass cache: %q %v", lastSource, err)
	}
	_, err := VercelToken(VercelTokenOptions{ExchangeURL: server.URL, Getenv: envMap(nil)})(context.Background())
	if err == nil || !strings.Contains(err.Error(), "VERCEL_OIDC_TOKEN") {
		t.Fatalf("expected missing source error, got %v", err)
	}
}

func TestVercelTokenSurfacesErrorBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"audience not allowed"}`))
	}))
	defer server.Close()
	_, err := VercelToken(VercelTokenOptions{ExchangeURL: server.URL, Token: "src"})(context.Background())
	if err == nil || !strings.Contains(err.Error(), "audience not allowed") || !strings.Contains(err.Error(), "400") {
		t.Fatalf("expected error body message, got %v", err)
	}
}

func TestWorkloadTokenProviderWorksWithClient(t *testing.T) {
	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"value":"gh-oidc"}`))
	}))
	defer tokenServer.Close()
	server, recorder := newAuthServer(t)
	client := NewWithAPIKeyProvider(GitHubActionsToken(GitHubActionsTokenOptions{Getenv: envMap(map[string]string{
		"ACTIONS_ID_TOKEN_REQUEST_URL":   tokenServer.URL,
		"ACTIONS_ID_TOKEN_REQUEST_TOKEN": "rt",
	})}), server.URL)
	if _, err := client.RequestWithResponse(context.Background(), http.MethodGet, "/credits", nil, nil, nil); err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if got := recorder.all(); len(got) != 1 || got[0] != "Bearer gh-oidc" {
		t.Fatalf("expected GitHub token as bearer, got %#v", got)
	}
}
