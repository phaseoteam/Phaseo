package phaseo

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	gen "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v4/src/gen"
)

// APIKeyProvider returns the credential for one request: an API key, or a short-lived token
// such as a Vercel or GitHub Actions OIDC token for a trusted workload. It is called before
// every request and retry, so it can refresh tokens; cache inside it if fetching a token is
// expensive. GitHubActionsToken and VercelToken return ready-made providers.
type APIKeyProvider func(ctx context.Context) (string, error)

// ErrEmptyAPIKey is returned when an APIKeyProvider returns a blank credential.
var ErrEmptyAPIKey = errors.New("phaseo: the API key provider returned an empty credential")

// WithAPIKeyProvider resolves the credential before every request and retry instead of
// using the fixed key passed to New. A request that already sets an Authorization header
// keeps it and the provider is not called.
func WithAPIKeyProvider(provider APIKeyProvider) Option {
	return func(c *Phaseo) {
		if provider != nil {
			c.apiKeyProvider = provider
		}
	}
}

// NewWithAPIKeyProvider creates a client that calls provider for the credential before
// every request and retry.
func NewWithAPIKeyProvider(provider APIKeyProvider, baseURL string, opts ...Option) *Phaseo {
	return New("", baseURL, append([]Option{WithAPIKeyProvider(provider)}, opts...)...)
}

// resolveAPIKey calls the provider and returns the trimmed credential.
func resolveAPIKey(ctx context.Context, provider APIKeyProvider) (string, error) {
	credential, err := provider(ctx)
	if err != nil {
		return "", fmt.Errorf("phaseo: resolve API key: %w", err)
	}
	credential = strings.TrimSpace(credential)
	if credential == "" {
		return "", ErrEmptyAPIKey
	}
	return credential, nil
}

// installAPIKeyProvider swaps the static Authorization header for a transport that asks the
// provider on every attempt. The caller's http.Client is copied, never modified.
func installAPIKeyProvider(raw *gen.Client, provider APIKeyProvider) {
	delete(raw.Headers, "Authorization")
	base := raw.HTTPClient
	if base == nil {
		base = http.DefaultClient
	}
	wrapped := *base
	wrapped.Transport = &apiKeyTransport{base: base.Transport, provider: provider, raw: raw}
	raw.HTTPClient = &wrapped
}

type apiKeyTransport struct {
	base     http.RoundTripper
	provider APIKeyProvider
	raw      *gen.Client
}

func (t *apiKeyTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	// Keep a per-request Authorization header, and never attach the credential when a
	// redirect leaves the gateway host (net/http strips Authorization on those itself).
	if req.Header.Get("Authorization") != "" || !t.sameHostAsBaseURL(req.URL) {
		return base.RoundTrip(req)
	}
	credential, err := resolveAPIKey(req.Context(), t.provider)
	if err != nil {
		if req.Body != nil {
			_ = req.Body.Close()
		}
		return nil, err
	}
	authorized := req.Clone(req.Context())
	authorized.Header.Set("Authorization", "Bearer "+credential)
	return base.RoundTrip(authorized)
}

func (t *apiKeyTransport) sameHostAsBaseURL(target *url.URL) bool {
	base, err := url.Parse(t.raw.BaseURL)
	if err != nil || target == nil {
		return false
	}
	return strings.EqualFold(base.Host, target.Host)
}
