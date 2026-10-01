package gen

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type RequestOptions struct {
	Context        context.Context
	Headers        map[string]string
	Timeout        time.Duration
	MaxRetries     *int
	IdempotencyKey string
}

type RequestEvent struct {
	Method         string
	URL            string
	Attempt        int
	IdempotencyKey string
	StartedAt      time.Time
}

type ResponseEvent struct {
	RequestEvent
	StatusCode int
	RequestID  string
	Elapsed    time.Duration
}

type RetryEvent struct {
	RequestEvent
	StatusCode int
	Delay      time.Duration
	Err        error
}

type Response struct {
	StatusCode int
	Status     string
	Headers    http.Header
	Body       []byte
}

func (r *Response) RequestID() string {
	if r == nil {
		return ""
	}
	if value := r.Headers.Get("X-Request-Id"); value != "" {
		return value
	}
	return r.Headers.Get("X-Phaseo-Request-Id")
}

func (r *Response) TraceURL() string {
	if id := r.RequestID(); id != "" {
		return "https://phaseo.app/settings/usage/logs/requests/" + url.PathEscape(id)
	}
	return ""
}

type Client struct {
	BaseURL    string
	HTTPClient *http.Client
	Headers    map[string]string
	Timeout    time.Duration
	MaxRetries int
	OnRequest  func(RequestEvent)
	OnResponse func(ResponseEvent)
	OnRetry    func(RetryEvent)
}

type HTTPError struct {
	StatusCode int
	Status     string
	Headers    http.Header
	Body       []byte
	Code       string
}

func (e *HTTPError) Error() string {
	if e == nil {
		return "http error"
	}
	if text := strings.TrimSpace(string(e.Body)); text != "" {
		return fmt.Sprintf("request failed: %s: %s", e.Status, text)
	}
	return fmt.Sprintf("request failed: %s", e.Status)
}

func (e *HTTPError) RequestID() string {
	if e == nil {
		return ""
	}
	if value := e.Headers.Get("X-Request-Id"); value != "" {
		return value
	}
	return e.Headers.Get("X-Phaseo-Request-Id")
}

func (e *HTTPError) TraceURL() string {
	if id := e.RequestID(); id != "" {
		return "https://phaseo.app/settings/usage/logs/requests/" + url.PathEscape(id)
	}
	return ""
}

func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		HTTPClient: http.DefaultClient,
		Headers:    map[string]string{},
		Timeout:    60 * time.Second,
	}
}

func (c *Client) Request(method string, path string, query map[string]string, headers map[string]string, body any) ([]byte, error) {
	response, err := c.RequestWithOptions(method, path, query, body, &RequestOptions{Headers: headers})
	if err != nil {
		return nil, err
	}
	return response.Body, nil
}

func (c *Client) RequestWithOptions(method string, path string, query map[string]string, body any, options *RequestOptions) (*Response, error) {
	if options == nil {
		options = &RequestOptions{}
	}
	method = strings.ToUpper(method)
	endpoint := c.BaseURL + path
	if len(query) > 0 {
		values := url.Values{}
		for key, value := range query {
			values.Set(key, value)
		}
		endpoint += "?" + values.Encode()
	}
	var bodyBytes []byte
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyBytes = data
	}
	ctx := options.Context
	if ctx == nil {
		ctx = context.Background()
	}
	timeout := options.Timeout
	if timeout == 0 {
		timeout = c.Timeout
	}
	if timeout < 0 {
		return nil, fmt.Errorf("timeout must be non-negative")
	}
	if timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}
	retries := c.MaxRetries
	if options.MaxRetries != nil {
		retries = *options.MaxRetries
	}
	if retries < 0 || retries > 10 {
		return nil, fmt.Errorf("max retries must be between 0 and 10")
	}
	if method != http.MethodGet && method != http.MethodHead {
		retries = 0
	}
	started := time.Now()
	for attempt := 0; ; attempt++ {
		req, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(bodyBytes))
		if err != nil {
			return nil, err
		}
		for key, value := range c.Headers {
			req.Header.Set(key, value)
		}
		for key, value := range options.Headers {
			req.Header.Set(key, value)
		}
		if options.IdempotencyKey != "" {
			req.Header.Set("Idempotency-Key", options.IdempotencyKey)
		}
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		event := RequestEvent{Method: method, URL: endpoint, Attempt: attempt, IdempotencyKey: options.IdempotencyKey, StartedAt: time.Now()}
		if c.OnRequest != nil {
			c.OnRequest(event)
		}
		resp, err := c.HTTPClient.Do(req)
		if err != nil {
			if attempt >= retries {
				return nil, err
			}
			delay := backoff(attempt)
			if c.OnRetry != nil {
				c.OnRetry(RetryEvent{RequestEvent: event, Delay: delay, Err: err})
			}
			if err := wait(ctx, delay); err != nil {
				return nil, err
			}
			continue
		}
		data, readErr := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if readErr != nil {
			return nil, readErr
		}
		response := &Response{StatusCode: resp.StatusCode, Status: resp.Status, Headers: resp.Header.Clone(), Body: data}
		if retryableStatus(resp.StatusCode) && attempt < retries {
			delay := retryDelay(resp.Header.Get("Retry-After"), attempt)
			if c.OnRetry != nil {
				c.OnRetry(RetryEvent{RequestEvent: event, StatusCode: resp.StatusCode, Delay: delay})
			}
			if err := wait(ctx, delay); err != nil {
				return nil, err
			}
			continue
		}
		if c.OnResponse != nil {
			c.OnResponse(ResponseEvent{RequestEvent: event, StatusCode: resp.StatusCode, RequestID: response.RequestID(), Elapsed: time.Since(started)})
		}
		if resp.StatusCode >= 400 {
			return nil, &HTTPError{StatusCode: resp.StatusCode, Status: resp.Status, Headers: resp.Header.Clone(), Body: data, Code: errorCode(data)}
		}
		return response, nil
	}
}

func DecodeJSON[T any](data []byte, out *T) error {
	if len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, out)
}

func errorCode(data []byte) string {
	var body map[string]any
	if json.Unmarshal(data, &body) != nil {
		return ""
	}
	if value, ok := body["code"].(string); ok {
		return value
	}
	if value, ok := body["error"].(string); ok {
		return value
	}
	if value, ok := body["error"].(map[string]any); ok {
		if code, ok := value["code"].(string); ok {
			return code
		}
	}
	return ""
}

func retryableStatus(status int) bool {
	return status == 408 || status == 429 || status == 500 || status == 502 || status == 503 || status == 504
}
func backoff(attempt int) time.Duration {
	delay := 250 * time.Millisecond * time.Duration(1<<attempt)
	if delay > 5*time.Second {
		return 5 * time.Second
	}
	return delay
}
func retryDelay(value string, attempt int) time.Duration {
	if seconds, err := strconv.ParseFloat(value, 64); err == nil && seconds >= 0 {
		return time.Duration(seconds * float64(time.Second))
	}
	if at, err := http.ParseTime(value); err == nil {
		if delay := time.Until(at); delay > 0 {
			return delay
		}
		return 0
	}
	return backoff(attempt)
}
func wait(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
