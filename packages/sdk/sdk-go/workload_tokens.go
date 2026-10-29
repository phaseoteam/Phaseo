package phaseo

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// DefaultTrustedWorkloadAudience is the audience Phaseo accepts on trusted-workload OIDC tokens.
const DefaultTrustedWorkloadAudience = "https://api.phaseo.app"

const (
	defaultVercelTokenExchangeURL = "https://oidc.vercel.com/~token"
	workloadTokenTimeout          = 10 * time.Second
	workloadTokenRefreshMargin    = 60 * time.Second
)

// GitHubActionsTokenOptions configures GitHubActionsToken. Every field is optional.
type GitHubActionsTokenOptions struct {
	// Audience defaults to DefaultTrustedWorkloadAudience.
	Audience string
	// HTTPClient defaults to http.DefaultClient. Requests time out after 10 seconds.
	HTTPClient *http.Client
	// Getenv defaults to os.Getenv.
	Getenv func(string) string
	// Now defaults to time.Now.
	Now func() time.Time
}

// VercelTokenOptions configures VercelToken. Every field is optional.
type VercelTokenOptions struct {
	// Audience defaults to DefaultTrustedWorkloadAudience.
	Audience string
	// Token is the Vercel OIDC token to exchange.
	Token string
	// TokenProvider returns the Vercel OIDC token to exchange, for example the per-request
	// x-vercel-oidc-token header value. It takes precedence over Token.
	TokenProvider func(ctx context.Context) (string, error)
	// HTTPClient defaults to http.DefaultClient. Requests time out after 10 seconds.
	HTTPClient *http.Client
	// ExchangeURL defaults to https://oidc.vercel.com/~token.
	ExchangeURL string
	// Getenv defaults to os.Getenv.
	Getenv func(string) string
	// ReadFile defaults to os.ReadFile.
	ReadFile func(string) ([]byte, error)
	// Now defaults to time.Now.
	Now func() time.Time
}

type cachedWorkloadToken struct {
	key       string
	token     string
	expiresAt time.Time
}

func (c *cachedWorkloadToken) get(key string, now time.Time) (string, bool) {
	if c.token == "" || c.key != key || !now.Before(c.expiresAt.Add(-workloadTokenRefreshMargin)) {
		return "", false
	}
	return c.token, true
}

func (c *cachedWorkloadToken) set(key string, token string, expiresAt time.Time) {
	if expiresAt.IsZero() {
		*c = cachedWorkloadToken{}
		return
	}
	*c = cachedWorkloadToken{key: key, token: token, expiresAt: expiresAt}
}

// GitHubActionsToken returns an APIKeyProvider that fetches a GitHub Actions OIDC token for
// Phaseo and reuses it until 60 seconds before it expires. The job needs
// `permissions: id-token: write`.
func GitHubActionsToken(options ...GitHubActionsTokenOptions) APIKeyProvider {
	var opts GitHubActionsTokenOptions
	if len(options) > 0 {
		opts = options[0]
	}
	audience := firstNonBlank(opts.Audience, DefaultTrustedWorkloadAudience)
	getenv := opts.Getenv
	if getenv == nil {
		getenv = os.Getenv
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	var mu sync.Mutex
	var cache cachedWorkloadToken
	return func(ctx context.Context) (string, error) {
		mu.Lock()
		defer mu.Unlock()
		if token, ok := cache.get(audience, now()); ok {
			return token, nil
		}
		requestURL := strings.TrimSpace(getenv("ACTIONS_ID_TOKEN_REQUEST_URL"))
		requestToken := strings.TrimSpace(getenv("ACTIONS_ID_TOKEN_REQUEST_TOKEN"))
		if requestURL == "" || requestToken == "" {
			return "", errors.New("phaseo: GitHub Actions OIDC token is unavailable: ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN are not set; give the job `permissions: id-token: write`")
		}
		separator := "?"
		if strings.Contains(requestURL, "?") {
			separator = "&"
		}
		ctx, cancel := context.WithTimeout(ctx, workloadTokenTimeout)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL+separator+"audience="+url.QueryEscape(audience), nil)
		if err != nil {
			return "", fmt.Errorf("phaseo: GitHub Actions OIDC token request: %w", err)
		}
		req.Header.Set("Authorization", "bearer "+requestToken)
		req.Header.Set("Accept", "application/json")
		status, body, err := doWorkloadTokenRequest(opts.HTTPClient, req)
		if err != nil {
			return "", fmt.Errorf("phaseo: GitHub Actions OIDC token request: %w", err)
		}
		if status < 200 || status > 299 {
			return "", fmt.Errorf("phaseo: GitHub Actions OIDC token request failed with status %d", status)
		}
		var payload struct {
			Value string `json:"value"`
		}
		_ = json.Unmarshal(body, &payload)
		token := strings.TrimSpace(payload.Value)
		if token == "" {
			return "", errors.New("phaseo: GitHub Actions OIDC token response has no value")
		}
		cache.set(audience, token, jwtExpiry(token))
		return token, nil
	}
}

// VercelToken returns an APIKeyProvider that exchanges the deployment's Vercel OIDC token for
// one issued to Phaseo and reuses it until 60 seconds before it expires. The source token is
// TokenProvider, then Token, then the file named by VERCEL_OIDC_TOKEN_FILE, then
// VERCEL_OIDC_TOKEN.
func VercelToken(options ...VercelTokenOptions) APIKeyProvider {
	var opts VercelTokenOptions
	if len(options) > 0 {
		opts = options[0]
	}
	audience := firstNonBlank(opts.Audience, DefaultTrustedWorkloadAudience)
	exchangeURL := firstNonBlank(opts.ExchangeURL, defaultVercelTokenExchangeURL)
	getenv := opts.Getenv
	if getenv == nil {
		getenv = os.Getenv
	}
	readFile := opts.ReadFile
	if readFile == nil {
		readFile = os.ReadFile
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	var mu sync.Mutex
	var cache cachedWorkloadToken
	return func(ctx context.Context) (string, error) {
		source, err := vercelSourceToken(ctx, opts, getenv, readFile)
		if err != nil {
			return "", err
		}
		mu.Lock()
		defer mu.Unlock()
		cacheKey := audience + "\x00" + source
		if token, ok := cache.get(cacheKey, now()); ok {
			return token, nil
		}
		payload, err := json.Marshal(map[string]string{"token": source, "aud": audience})
		if err != nil {
			return "", err
		}
		ctx, cancel := context.WithTimeout(ctx, workloadTokenTimeout)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, exchangeURL, bytes.NewReader(payload))
		if err != nil {
			return "", fmt.Errorf("phaseo: Vercel OIDC token exchange: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		status, body, err := doWorkloadTokenRequest(opts.HTTPClient, req)
		if err != nil {
			return "", fmt.Errorf("phaseo: Vercel OIDC token exchange: %w", err)
		}
		var response struct {
			Token  string          `json:"token"`
			Expiry json.Number     `json:"expiry"`
			Error  json.RawMessage `json:"error"`
		}
		decodeErr := json.Unmarshal(body, &response)
		if status < 200 || status > 299 {
			if message := vercelErrorMessage(response.Error); decodeErr == nil && message != "" {
				return "", fmt.Errorf("phaseo: Vercel OIDC token exchange failed with status %d: %s", status, message)
			}
			return "", fmt.Errorf("phaseo: Vercel OIDC token exchange failed with status %d", status)
		}
		token := strings.TrimSpace(response.Token)
		if token == "" {
			return "", errors.New("phaseo: Vercel OIDC token exchange response has no token")
		}
		expiresAt := time.Time{}
		if seconds, err := response.Expiry.Float64(); err == nil && seconds > 0 {
			expiresAt = time.Unix(int64(seconds), 0)
		} else {
			expiresAt = jwtExpiry(token)
		}
		cache.set(cacheKey, token, expiresAt)
		return token, nil
	}
}

func vercelSourceToken(ctx context.Context, opts VercelTokenOptions, getenv func(string) string, readFile func(string) ([]byte, error)) (string, error) {
	if opts.TokenProvider != nil {
		token, err := opts.TokenProvider(ctx)
		if err != nil {
			return "", fmt.Errorf("phaseo: Vercel OIDC token: %w", err)
		}
		if token = strings.TrimSpace(token); token != "" {
			return token, nil
		}
		return "", errors.New("phaseo: Vercel OIDC token provider returned an empty token")
	}
	if token := strings.TrimSpace(opts.Token); token != "" {
		return token, nil
	}
	if path := strings.TrimSpace(getenv("VERCEL_OIDC_TOKEN_FILE")); path != "" {
		data, err := readFile(path)
		if err != nil {
			return "", fmt.Errorf("phaseo: read VERCEL_OIDC_TOKEN_FILE: %w", err)
		}
		if token := strings.TrimSpace(string(data)); token != "" {
			return token, nil
		}
	}
	if token := strings.TrimSpace(getenv("VERCEL_OIDC_TOKEN")); token != "" {
		return token, nil
	}
	return "", errors.New("phaseo: no Vercel OIDC token: pass Token or TokenProvider (for example the x-vercel-oidc-token request header), or set VERCEL_OIDC_TOKEN_FILE or VERCEL_OIDC_TOKEN")
}

func vercelErrorMessage(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return strings.TrimSpace(text)
	}
	var object struct {
		Message string `json:"message"`
	}
	if json.Unmarshal(raw, &object) == nil {
		return strings.TrimSpace(object.Message)
	}
	return ""
}

func doWorkloadTokenRequest(client *http.Client, req *http.Request) (int, []byte, error) {
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return 0, nil, err
	}
	return resp.StatusCode, body, nil
}

// jwtExpiry reads the exp claim without checking the signature. It returns the zero time
// when the token isn't a JWT or has no exp, which turns caching off.
func jwtExpiry(token string) time.Time {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return time.Time{}
	}
	data, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(parts[1], "="))
	if err != nil {
		return time.Time{}
	}
	var claims struct {
		Exp json.Number `json:"exp"`
	}
	if json.Unmarshal(data, &claims) != nil {
		return time.Time{}
	}
	seconds, err := claims.Exp.Float64()
	if err != nil || seconds <= 0 {
		return time.Time{}
	}
	return time.Unix(int64(seconds), 0)
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
