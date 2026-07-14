package phaseo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	gen "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/src/gen"
)

const defaultBaseURL = "https://api.phaseo.app/v1"

type ChatCompletionsRequest = gen.ChatCompletionsRequest
type ResponsesRequest = gen.ResponsesRequest

type PhaseoLogLevel string

const (
	PhaseoLogLevelInfo  PhaseoLogLevel = "info"
	PhaseoLogLevelWarn  PhaseoLogLevel = "warn"
	PhaseoLogLevelError PhaseoLogLevel = "error"
)

type PhaseoLogger func(level PhaseoLogLevel, message string, meta map[string]any)

type Option func(*Phaseo)

type ModelLifecycleInfo struct {
	ModelID            string
	Status             string
	SourceStatus       *string
	DeprecationDate    *string
	RetirementDate     *string
	ReplacementModelID *string
	Message            *string
}

type ModelValidationResult struct {
	OK     bool
	Info   *ModelLifecycleInfo
	Reason string
}

type AsyncJobWebSocketOptions struct {
	IntervalMS      int
	CloseOnTerminal *bool
}

type AsyncJobsResource struct {
	parent *Phaseo
}

func (r *AsyncJobsResource) WebSocketURL(kind string, jobID string, options *AsyncJobWebSocketOptions) (string, error) {
	return r.parent.GetAsyncJobWebSocketURL(kind, jobID, options)
}

var activeModelSourceStatuses = map[string]struct{}{
	"active":    {},
	"available": {},
}

var inactiveModelSourceStatuses = map[string]struct{}{
	"deprecated":  {},
	"retired":     {},
	"withheld":    {},
	"announced":   {},
	"rumoured":    {},
	"rumored":     {},
	"unavailable": {},
	"disabled":    {},
	"internal":    {},
	"private":     {},
	"removed":     {},
	"sunset":      {},
	"eol":         {},
	"end_of_life": {},
	"end-of-life": {},
}

// Phaseo is a thin facade over the generated Go client in src/gen.
type Phaseo struct {
	raw                       *gen.Client
	enableDeprecationWarnings bool
	warningsAsErrors          bool
	logger                    PhaseoLogger
	telemetry                 *telemetryRecorder
	AsyncJobs                 *AsyncJobsResource
	warnedModels              map[string]struct{}
	modelLifecycleCache       map[string]*ModelLifecycleInfo
	lifecycleResolver         func(ctx context.Context, modelID string) (*ModelLifecycleInfo, error)
	mu                        sync.Mutex
}

func WithDeprecationWarnings(enabled bool) Option {
	return func(c *Phaseo) {
		c.enableDeprecationWarnings = enabled
	}
}

func WithWarningsAsErrors(enabled bool) Option {
	return func(c *Phaseo) {
		c.warningsAsErrors = enabled
	}
}

func WithLogger(logger PhaseoLogger) Option {
	return func(c *Phaseo) {
		c.logger = logger
	}
}

// WithLifecycleResolver can override lifecycle lookup (useful for testing).
func WithLifecycleResolver(
	resolver func(ctx context.Context, modelID string) (*ModelLifecycleInfo, error),
) Option {
	return func(c *Phaseo) {
		c.lifecycleResolver = resolver
	}
}

// New creates a new API client targeting the given base URL with a bearer token.
func New(apiKey string, baseURL string, opts ...Option) *Phaseo {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = defaultBaseURL
	}
	raw := gen.NewClient(baseURL)
	raw.Headers["Authorization"] = "Bearer " + apiKey
	client := &Phaseo{
		raw:                       raw,
		enableDeprecationWarnings: true,
		warningsAsErrors:          false,
		telemetry:                 newTelemetryRecorder(nil, goSDKVersion),
		warnedModels:              map[string]struct{}{},
		modelLifecycleCache:       map[string]*ModelLifecycleInfo{},
	}
	for _, opt := range opts {
		opt(client)
	}
	if client.lifecycleResolver == nil {
		client.lifecycleResolver = client.fetchModelLifecycle
	}
	client.AsyncJobs = &AsyncJobsResource{parent: client}
	return client
}

// NewPhaseo is an explicit alias of New for consistency with other SDKs.
func NewPhaseo(apiKey string, baseURL string, opts ...Option) *Phaseo {
	return New(apiKey, baseURL, opts...)
}

// NewFromEnv creates a client using PHASEO_API_KEY and the default base URL.
func NewFromEnv(opts ...Option) (*Phaseo, error) {
	apiKey := os.Getenv("PHASEO_API_KEY")
	if apiKey == "" {
		return nil, errors.New("missing API key: set PHASEO_API_KEY")
	}
	return New(apiKey, defaultBaseURL, opts...), nil
}

// MustNewFromEnv creates a client using PHASEO_API_KEY and panics when missing.
func MustNewFromEnv(opts ...Option) *Phaseo {
	client, err := NewFromEnv(opts...)
	if err != nil {
		panic(err)
	}
	return client
}

// NewPhaseoFromEnv is an explicit alias of NewFromEnv for consistency with other SDKs.
func NewPhaseoFromEnv(opts ...Option) (*Phaseo, error) {
	return NewFromEnv(opts...)
}

// MustNewPhaseoFromEnv is an explicit alias of MustNewFromEnv.
func MustNewPhaseoFromEnv(opts ...Option) *Phaseo {
	return MustNewFromEnv(opts...)
}

// RawClient exposes the generated client for full operation coverage.
func (c *Phaseo) RawClient() *gen.Client {
	return c.raw
}

// Request sends an arbitrary HTTP request through the generated transport.
func (c *Phaseo) Request(_ context.Context, method string, path string, query map[string]string, headers map[string]string, body any) (map[string]interface{}, error) {
	endpoint := strings.TrimPrefix(strings.TrimSpace(path), "/")
	if endpoint == "" {
		endpoint = "request"
	}
	return withLifecycleAndTelemetry(c, context.Background(), endpoint, body, true, func() (map[string]interface{}, error) {
		raw, err := c.raw.Request(method, path, query, headers, body)
		if err != nil {
			return nil, err
		}
		if len(raw) == 0 {
			return map[string]interface{}{}, nil
		}
		var decoded map[string]interface{}
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return nil, fmt.Errorf("decode response: %w", err)
		}
		return decoded, nil
	})
}

func decodeTo[T any](input map[string]interface{}) (T, error) {
	var out T
	data, err := json.Marshal(input)
	if err != nil {
		return out, err
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return out, err
	}
	return out, nil
}

func (c *Phaseo) GetModelDeprecationInfo(ctx context.Context, modelID string) (*ModelLifecycleInfo, error) {
	normalizedModelID := strings.TrimSpace(modelID)
	if normalizedModelID == "" {
		return nil, nil
	}

	c.mu.Lock()
	if cached, ok := c.modelLifecycleCache[normalizedModelID]; ok {
		c.mu.Unlock()
		return cached, nil
	}
	c.mu.Unlock()

	info, err := c.lifecycleResolver(ctx, normalizedModelID)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.modelLifecycleCache[normalizedModelID] = info
	c.mu.Unlock()
	return info, nil
}

func (c *Phaseo) ValidateModel(ctx context.Context, modelID string) (ModelValidationResult, error) {
	info, err := c.GetModelDeprecationInfo(ctx, modelID)
	if err != nil {
		return ModelValidationResult{}, err
	}
	if info == nil {
		return ModelValidationResult{OK: true, Info: nil}, nil
	}
	if !isModelRequestableForInference(info) {
		return ModelValidationResult{
			OK:     false,
			Info:   info,
			Reason: buildInactiveModelRequestMessage(info),
		}, nil
	}
	return ModelValidationResult{OK: true, Info: info}, nil
}

func (c *Phaseo) maybeWarnForPayload(ctx context.Context, payload any) error {
	modelID := extractModelIDFromPayload(payload)
	if modelID == "" {
		return nil
	}
	if err := c.ensureModelRequestable(ctx, modelID); err != nil {
		return err
	}
	return c.maybeWarnForModel(ctx, modelID)
}

func (c *Phaseo) ensureModelRequestable(ctx context.Context, modelID string) error {
	normalizedModelID := strings.TrimSpace(modelID)
	if normalizedModelID == "" {
		return nil
	}

	lifecycle, err := c.GetModelDeprecationInfo(ctx, normalizedModelID)
	if err != nil || lifecycle == nil {
		return err
	}

	if isModelRequestableForInference(lifecycle) {
		return nil
	}

	return errors.New(buildInactiveModelRequestMessage(lifecycle))
}

func (c *Phaseo) maybeWarnForModel(ctx context.Context, modelID string) error {
	if !c.enableDeprecationWarnings {
		return nil
	}

	normalizedModelID := strings.TrimSpace(modelID)
	if normalizedModelID == "" {
		return nil
	}

	lifecycle, err := c.GetModelDeprecationInfo(ctx, normalizedModelID)
	if err != nil || lifecycle == nil || lifecycle.Status == "active" {
		return nil
	}

	message := buildLifecycleMessage(
		lifecycle.Status,
		lifecycle.ModelID,
		lifecycle.DeprecationDate,
		lifecycle.RetirementDate,
		lifecycle.ReplacementModelID,
	)
	if lifecycle.Message != nil && strings.TrimSpace(*lifecycle.Message) != "" {
		message = *lifecycle.Message
	}

	if c.warningsAsErrors {
		return errors.New(message)
	}

	c.mu.Lock()
	if _, ok := c.warnedModels[normalizedModelID]; ok {
		c.mu.Unlock()
		return nil
	}
	c.warnedModels[normalizedModelID] = struct{}{}
	c.mu.Unlock()

	meta := map[string]any{
		"model_id":             lifecycle.ModelID,
		"status":               lifecycle.Status,
		"deprecation_date":     lifecycle.DeprecationDate,
		"retirement_date":      lifecycle.RetirementDate,
		"replacement_model_id": lifecycle.ReplacementModelID,
	}
	if c.logger != nil {
		c.logger(PhaseoLogLevelWarn, message, meta)
		return nil
	}
	_, _ = fmt.Fprintln(os.Stderr, message)
	return nil
}

func (c *Phaseo) fetchModelLifecycle(
	_ context.Context,
	modelID string,
) (*ModelLifecycleInfo, error) {
	payload, err := gen.ListModels(
		c.raw,
		nil,
		map[string]string{
			"model_id": modelID,
			"limit":    "1",
		},
		nil,
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("list model lifecycle for %q: %w", modelID, err)
	}

	models, ok := payload["models"]
	if !ok {
		return nil, nil
	}
	for _, item := range asSlice(models) {
		model := asMap(item)
		if strings.TrimSpace(asString(model["model_id"])) != modelID {
			continue
		}
		return toModelLifecycleInfo(model, modelID), nil
	}
	return nil, nil
}

// GetModels calls /models.
func (c *Phaseo) GetModels(_ context.Context, query map[string]string) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "models.list", query, false, func() (map[string]interface{}, error) {
		return gen.ListModels(c.raw, nil, query, nil, nil)
	})
}

// ListProviders calls /providers.
func (c *Phaseo) ListProviders(_ context.Context, query map[string]string) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "providers", query, false, func() (map[string]interface{}, error) {
		return gen.ListProviders(c.raw, nil, query, nil, nil)
	})
}

// GetAnalytics calls /analytics.
func (c *Phaseo) GetAnalytics(_ context.Context, query map[string]string) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "analytics", query, false, func() (map[string]interface{}, error) {
		return gen.GetActivityAlias(c.raw, nil, query, nil, nil)
	})
}

// GetCredits calls /credits.
func (c *Phaseo) GetCredits(_ context.Context, query map[string]string) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "credits", query, false, func() (map[string]interface{}, error) {
		return gen.GetCredits(c.raw, nil, query, nil, nil)
	})
}

// GetActivity calls /activity.
func (c *Phaseo) GetActivity(_ context.Context, query map[string]string) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "activity", query, false, func() (map[string]interface{}, error) {
		return gen.GetActivity(c.raw, nil, query, nil, nil)
	})
}

// GetGeneration calls /generation?id=...
func (c *Phaseo) GetGeneration(_ context.Context, generationID string) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "generations.retrieve", map[string]any{"id": generationID}, false, func() (map[string]interface{}, error) {
		return gen.GetGeneration(c.raw, nil, map[string]string{"id": generationID}, nil, nil)
	})
}

// Health calls /health.
func (c *Phaseo) Health(_ context.Context) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "health", nil, false, func() (map[string]interface{}, error) {
		raw, err := c.raw.Request("GET", "/health", nil, nil, nil)
		if err != nil {
			return nil, err
		}
		if len(raw) == 0 {
			return map[string]interface{}{}, nil
		}
		var decoded map[string]interface{}
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return nil, fmt.Errorf("decode response: %w", err)
		}
		return decoded, nil
	})
}

// GenerateText calls /chat/completions.
func (c *Phaseo) GenerateText(ctx context.Context, req gen.ChatCompletionsRequest) (map[string]interface{}, error) {
	body := map[string]interface{}{
		"model":    req.Model,
		"messages": req.Messages,
	}
	if req.Stream != nil {
		body["stream"] = *req.Stream
	}
	if req.Temperature != nil {
		body["temperature"] = *req.Temperature
	}
	if req.MaxCompletionTokens != nil {
		body["max_completion_tokens"] = *req.MaxCompletionTokens
	}
	if req.MaxTokens != nil {
		body["max_tokens"] = *req.MaxTokens
	}
	if req.Tools != nil {
		body["tools"] = *req.Tools
	}
	if req.ToolChoice != nil {
		body["tool_choice"] = req.ToolChoice
	}
	if req.ServiceTier != nil {
		body["service_tier"] = *req.ServiceTier
	}
	if req.Provider != nil {
		body["provider"] = req.Provider
	}
	return withLifecycleAndTelemetry(c, ctx, "chat.completions", body, true, func() (map[string]interface{}, error) {
		return gen.CreateChatCompletion(c.raw, nil, nil, nil, body)
	})
}

// CreateChatCompletion calls /chat/completions.
func (c *Phaseo) CreateChatCompletion(ctx context.Context, req gen.ChatCompletionsRequest) (map[string]interface{}, error) {
	return c.GenerateText(ctx, req)
}

// GenerateResponse calls /responses.
func (c *Phaseo) GenerateResponse(ctx context.Context, req gen.ResponsesRequest) (gen.ResponsesResponse, error) {
	started := time.Now()
	if err := c.maybeWarnForPayload(ctx, req); err != nil {
		c.telemetry.captureError("responses", req, err, time.Since(started))
		var zero gen.ResponsesResponse
		return zero, err
	}

	raw, err := gen.CreateResponse(c.raw, nil, nil, nil, req)
	if err != nil {
		c.telemetry.captureError("responses", req, err, time.Since(started))
		var zero gen.ResponsesResponse
		return zero, err
	}

	response, err := decodeTo[gen.ResponsesResponse](raw)
	if err != nil {
		c.telemetry.captureError("responses", req, err, time.Since(started))
		var zero gen.ResponsesResponse
		return zero, err
	}

	c.telemetry.captureSuccess("responses", req, raw, time.Since(started))
	return response, nil
}

// CreateResponse calls /responses.
func (c *Phaseo) CreateResponse(ctx context.Context, req gen.ResponsesRequest) (gen.ResponsesResponse, error) {
	return c.GenerateResponse(ctx, req)
}

// GenerateEmbedding calls /embeddings.
func (c *Phaseo) GenerateEmbedding(ctx context.Context, req any) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, ctx, "embeddings", req, true, func() (map[string]interface{}, error) {
		return gen.CreateEmbedding(c.raw, nil, nil, nil, req)
	})
}

// CreateEmbedding calls /embeddings.
func (c *Phaseo) CreateEmbedding(ctx context.Context, req any) (map[string]interface{}, error) {
	return c.GenerateEmbedding(ctx, req)
}

// GenerateModeration calls /moderations.
func (c *Phaseo) GenerateModeration(ctx context.Context, req any) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, ctx, "moderations", req, true, func() (map[string]interface{}, error) {
		return gen.CreateModeration(c.raw, nil, nil, nil, req)
	})
}

// CreateModeration calls /moderations.
func (c *Phaseo) CreateModeration(ctx context.Context, req any) (map[string]interface{}, error) {
	return c.GenerateModeration(ctx, req)
}

// CreateAnthropicMessage calls /messages.
func (c *Phaseo) CreateAnthropicMessage(ctx context.Context, req any) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, ctx, "messages", req, true, func() (map[string]interface{}, error) {
		return gen.CreateAnthropicMessage(c.raw, nil, nil, nil, req)
	})
}

// CreateImage calls /images/generations.
func (c *Phaseo) CreateImage(ctx context.Context, req any) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, ctx, "images.generations", req, true, func() (map[string]interface{}, error) {
		return gen.CreateImage(c.raw, nil, nil, nil, req)
	})
}

// CreateImageEdit calls /images/edits.
func (c *Phaseo) CreateImageEdit(ctx context.Context, req any) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, ctx, "images.edits", req, true, func() (map[string]interface{}, error) {
		return gen.CreateImageEdit(c.raw, nil, nil, nil, req)
	})
}

// CreateVideo calls /videos.
func (c *Phaseo) CreateVideo(ctx context.Context, req any) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, ctx, "video.generations", req, true, func() (map[string]interface{}, error) {
		return gen.CreateVideo(c.raw, nil, nil, nil, req)
	})
}

// GetVideo calls /videos/{video_id}.
func (c *Phaseo) GetVideo(_ context.Context, videoID string) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "video.retrieve", map[string]any{"video_id": videoID}, false, func() (map[string]interface{}, error) {
		return gen.GetVideo(c.raw, map[string]string{"video_id": videoID}, nil, nil, nil)
	})
}

// CancelVideo calls /videos/{video_id}/cancel.
func (c *Phaseo) CancelVideo(_ context.Context, videoID string) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "video.cancel", map[string]any{"video_id": videoID}, false, func() (map[string]interface{}, error) {
		raw, err := c.raw.Request("POST", "/videos/"+url.PathEscape(videoID)+"/cancel", nil, nil, nil)
		if err != nil {
			return nil, err
		}
		if len(raw) == 0 {
			return map[string]interface{}{}, nil
		}
		var decoded map[string]interface{}
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return nil, fmt.Errorf("decode response: %w", err)
		}
		return decoded, nil
	})
}

// DeleteVideo calls /videos/{video_id}.
func (c *Phaseo) DeleteVideo(_ context.Context, videoID string) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "video.delete", map[string]any{"video_id": videoID}, false, func() (map[string]interface{}, error) {
		return gen.DeleteVideo(c.raw, map[string]string{"video_id": videoID}, nil, nil, nil)
	})
}

// ListVideoModels calls /videos/models.
func (c *Phaseo) ListVideoModels(_ context.Context) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "video.models", nil, false, func() (map[string]interface{}, error) {
		return gen.ListVideoModels(c.raw, nil, nil, nil, nil)
	})
}

// ListVideos calls /videos.
func (c *Phaseo) ListVideos(_ context.Context, query map[string]string) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "video.list", query, false, func() (map[string]interface{}, error) {
		return gen.ListVideos(c.raw, nil, query, nil, nil)
	})
}

// CreateSpeech calls /audio/speech.
func (c *Phaseo) CreateSpeech(ctx context.Context, req any) (interface{}, error) {
	return withLifecycleAndTelemetry(c, ctx, "audio.speech", req, true, func() (interface{}, error) {
		return gen.CreateSpeech(c.raw, nil, nil, nil, req)
	})
}

// CreateTranscription calls /audio/transcriptions.
func (c *Phaseo) CreateTranscription(ctx context.Context, req any) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, ctx, "audio.transcriptions", req, true, func() (map[string]interface{}, error) {
		return gen.CreateTranscription(c.raw, nil, nil, nil, req)
	})
}

// CreateTranslation calls /audio/translations.
func (c *Phaseo) CreateTranslation(ctx context.Context, req any) (map[string]interface{}, error) {
	return withLifecycleAndTelemetry(c, ctx, "audio.translations", req, true, func() (map[string]interface{}, error) {
		return gen.CreateTranslation(c.raw, nil, nil, nil, req)
	})
}

// CreateBatch calls /batches.
func (c *Phaseo) CreateBatch(ctx context.Context, req any) (interface{}, error) {
	return withLifecycleAndTelemetry(c, ctx, "batches.create", req, true, func() (interface{}, error) {
		return gen.CreateBatch(c.raw, nil, nil, nil, req)
	})
}

// RetrieveBatch calls /batches/{batch_id}.
func (c *Phaseo) RetrieveBatch(_ context.Context, batchID string) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "batches.retrieve", map[string]any{"batch_id": batchID}, false, func() (interface{}, error) {
		return gen.RetrieveBatch(c.raw, map[string]string{"batch_id": batchID}, nil, nil, nil)
	})
}

// CancelBatch calls /batches/{batch_id}/cancel.
func (c *Phaseo) CancelBatch(_ context.Context, batchID string) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "batches.cancel", map[string]any{"batch_id": batchID}, false, func() (interface{}, error) {
		return gen.CancelBatch(c.raw, map[string]string{"batch_id": batchID}, nil, nil, nil)
	})
}

func (c *Phaseo) GetAsyncJobWebSocketURL(kind string, jobID string, options *AsyncJobWebSocketOptions) (string, error) {
	normalizedKind := strings.TrimSpace(kind)
	normalizedID := strings.TrimSpace(jobID)
	if normalizedKind == "" {
		return "", errors.New("kind is required")
	}
	if normalizedID == "" {
		return "", errors.New("jobID is required")
	}

	baseURL, err := url.Parse(strings.TrimRight(c.raw.BaseURL, "/") + "/")
	if err != nil {
		return "", fmt.Errorf("parse base URL: %w", err)
	}
	baseURL.Path = strings.TrimSuffix(baseURL.Path, "/") + "/async/" + normalizedKind + "/" + normalizedID + "/ws"
	baseURL.RawPath = strings.TrimSuffix(baseURL.EscapedPath(), "/") + "/async/" + url.PathEscape(normalizedKind) + "/" + url.PathEscape(normalizedID) + "/ws"
	query := baseURL.Query()
	if options != nil && options.IntervalMS > 0 {
		query.Set("interval_ms", fmt.Sprintf("%d", options.IntervalMS))
	}
	if options != nil && options.CloseOnTerminal != nil {
		query.Set("close_on_terminal", fmt.Sprintf("%t", *options.CloseOnTerminal))
	}
	baseURL.RawQuery = query.Encode()
	switch baseURL.Scheme {
	case "https":
		baseURL.Scheme = "wss"
	case "http":
		baseURL.Scheme = "ws"
	}
	return baseURL.String(), nil
}

func (c *Phaseo) GetBatchWebSocketURL(batchID string, options *AsyncJobWebSocketOptions) (string, error) {
	return c.GetAsyncJobWebSocketURL("batch", batchID, options)
}

func (c *Phaseo) GetVideoWebSocketURL(videoID string, options *AsyncJobWebSocketOptions) (string, error) {
	return c.GetAsyncJobWebSocketURL("video", videoID, options)
}

// ListFiles calls /files.
func (c *Phaseo) ListFiles(_ context.Context, query map[string]string) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "files.list", query, false, func() (interface{}, error) {
		return gen.ListFiles(c.raw, nil, query, nil, nil)
	})
}

// ListEndpoints calls /endpoints.
func (c *Phaseo) ListEndpoints(_ context.Context) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "endpoints.list", nil, false, func() (interface{}, error) {
		return gen.ListEndpoints(c.raw, nil, nil, nil, nil)
	})
}

// ListOrganisations calls /organisations.
func (c *Phaseo) ListOrganisations(_ context.Context, query map[string]string) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "organisations.list", query, false, func() (interface{}, error) {
		return gen.ListOrganisations(c.raw, nil, query, nil, nil)
	})
}

// ListPricingModels calls /pricing/models.
func (c *Phaseo) ListPricingModels(_ context.Context, query map[string]string) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "pricing.models", query, false, func() (interface{}, error) {
		return gen.ListPricingModels(c.raw, nil, query, nil, nil)
	})
}

// CalculatePricing calls /pricing/calculate.
func (c *Phaseo) CalculatePricing(_ context.Context, payload map[string]interface{}) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "pricing.calculate", payload, false, func() (interface{}, error) {
		return gen.CalculatePricing(c.raw, nil, nil, nil, payload)
	})
}

// ListApiKeys calls /keys.
func (c *Phaseo) ListApiKeys(_ context.Context, query map[string]string) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "provisioning.keys.list", query, false, func() (interface{}, error) {
		return gen.ListApiKeys(c.raw, nil, query, nil, nil)
	})
}

// CreateApiKey calls /keys.
func (c *Phaseo) CreateApiKey(_ context.Context, payload map[string]interface{}) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "provisioning.keys.create", payload, false, func() (interface{}, error) {
		return gen.CreateApiKey(c.raw, nil, nil, nil, payload)
	})
}

// GetApiKey calls /keys/{id}.
func (c *Phaseo) GetApiKey(_ context.Context, keyID string) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "provisioning.keys.get", map[string]any{"id": keyID}, false, func() (interface{}, error) {
		return gen.GetApiKey(c.raw, map[string]string{"id": keyID}, nil, nil, nil)
	})
}

// UpdateApiKey calls /keys/{id}.
func (c *Phaseo) UpdateApiKey(_ context.Context, keyID string, payload map[string]interface{}) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "provisioning.keys.update", map[string]any{"id": keyID, "body": payload}, false, func() (interface{}, error) {
		return gen.UpdateApiKey(c.raw, map[string]string{"id": keyID}, nil, nil, payload)
	})
}

// DeleteApiKey calls /keys/{id}.
func (c *Phaseo) DeleteApiKey(_ context.Context, keyID string) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "provisioning.keys.delete", map[string]any{"id": keyID}, false, func() (interface{}, error) {
		return gen.DeleteApiKey(c.raw, map[string]string{"id": keyID}, nil, nil, nil)
	})
}

// ListWorkspaces calls /workspaces.
func (c *Phaseo) ListWorkspaces(_ context.Context, query map[string]string) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "provisioning.workspaces.list", query, false, func() (interface{}, error) {
		return gen.ListWorkspaces(c.raw, nil, query, nil, nil)
	})
}

// GetWorkspace calls /workspaces/{id}.
func (c *Phaseo) GetWorkspace(_ context.Context, id string) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "provisioning.workspaces.get", map[string]any{"id": id}, false, func() (interface{}, error) {
		return gen.GetWorkspace(c.raw, map[string]string{"id": id}, nil, nil, nil)
	})
}

// CreateWorkspace calls /workspaces.
func (c *Phaseo) CreateWorkspace(_ context.Context, body map[string]interface{}) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "provisioning.workspaces.create", body, false, func() (interface{}, error) {
		return gen.CreateWorkspace(c.raw, nil, nil, nil, body)
	})
}

// UpdateWorkspace calls /workspaces/{id}.
func (c *Phaseo) UpdateWorkspace(_ context.Context, id string, body map[string]interface{}) (interface{}, error) {
	payload := map[string]any{"id": id}
	for key, value := range body {
		payload[key] = value
	}
	return withLifecycleAndTelemetry(c, context.Background(), "provisioning.workspaces.update", payload, false, func() (interface{}, error) {
		return gen.UpdateWorkspace(c.raw, map[string]string{"id": id}, nil, nil, body)
	})
}

// DeleteWorkspace calls /workspaces/{id}.
func (c *Phaseo) DeleteWorkspace(_ context.Context, id string) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "provisioning.workspaces.delete", map[string]any{"id": id}, false, func() (interface{}, error) {
		return gen.DeleteWorkspace(c.raw, map[string]string{"id": id}, nil, nil, nil)
	})
}

// GetCurrentApiKey calls /key.
func (c *Phaseo) GetCurrentApiKey(_ context.Context) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "key.current", nil, false, func() (interface{}, error) {
		return gen.GetCurrentApiKey(c.raw, nil, nil, nil, nil)
	})
}

// RetrieveFile calls /files/{file_id}.
func (c *Phaseo) RetrieveFile(_ context.Context, fileID string) (interface{}, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "files.retrieve", map[string]any{"file_id": fileID}, false, func() (interface{}, error) {
		return gen.RetrieveFile(c.raw, map[string]string{"file_id": fileID}, nil, nil, nil)
	})
}

// RetrieveFileContent calls /files/{file_id}/content.
func (c *Phaseo) RetrieveFileContent(_ context.Context, fileID string) ([]byte, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "files.content", map[string]any{"file_id": fileID}, false, func() ([]byte, error) {
		return c.raw.Request("GET", "/files/"+url.PathEscape(fileID)+"/content", nil, nil, nil)
	})
}

// RetrieveVideoContent calls /videos/{video_id}/content.
func (c *Phaseo) RetrieveVideoContent(_ context.Context, videoID string) ([]byte, error) {
	return withLifecycleAndTelemetry(c, context.Background(), "video.content", map[string]any{"video_id": videoID}, false, func() ([]byte, error) {
		return c.raw.Request("GET", "/videos/"+url.PathEscape(videoID)+"/content", nil, nil, nil)
	})
}

// GetVideoDownloadURL calls /videos/{video_id}/download_url.
func (c *Phaseo) GetVideoDownloadURL(_ context.Context, videoID string, params map[string]any) (map[string]any, error) {
	if params == nil {
		params = map[string]any{}
	}
	return withLifecycleAndTelemetry(c, context.Background(), "video.download_url", map[string]any{
		"video_id": videoID,
		"body":     params,
	}, false, func() (map[string]any, error) {
		raw, err := c.raw.Request("POST", "/videos/"+url.PathEscape(videoID)+"/download_url", nil, nil, params)
		if err != nil {
			return nil, err
		}
		if len(raw) == 0 {
			return map[string]any{}, nil
		}
		var decoded map[string]any
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return nil, fmt.Errorf("decode response: %w", err)
		}
		return decoded, nil
	})
}

func withLifecycleAndTelemetry[T any](
	c *Phaseo,
	ctx context.Context,
	endpoint string,
	request any,
	checkLifecycle bool,
	operation func() (T, error),
) (T, error) {
	started := time.Now()
	if checkLifecycle {
		if err := c.maybeWarnForPayload(ctx, request); err != nil {
			c.telemetry.captureError(endpoint, request, err, time.Since(started))
			var zero T
			return zero, err
		}
	}

	response, err := operation()
	if err != nil {
		c.telemetry.captureError(endpoint, request, err, time.Since(started))
		var zero T
		return zero, err
	}

	c.telemetry.captureSuccess(endpoint, request, response, time.Since(started))
	return response, nil
}

func extractModelIDFromPayload(payload any) string {
	switch typed := payload.(type) {
	case gen.ChatCompletionsRequest:
		return strings.TrimSpace(typed.Model)
	case gen.ResponsesRequest:
		return strings.TrimSpace(typed.Model)
	case map[string]any:
		return strings.TrimSpace(asString(typed["model"]))
	default:
		data, err := json.Marshal(payload)
		if err != nil {
			return ""
		}
		var body map[string]any
		if err := json.Unmarshal(data, &body); err != nil {
			return ""
		}
		return strings.TrimSpace(asString(body["model"]))
	}
}

func asSlice(value any) []any {
	switch typed := value.(type) {
	case []any:
		return typed
	default:
		return nil
	}
}

func asMap(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		return typed
	default:
		data, err := json.Marshal(value)
		if err != nil {
			return map[string]any{}
		}
		out := map[string]any{}
		if err := json.Unmarshal(data, &out); err != nil {
			return map[string]any{}
		}
		return out
	}
}

func asString(value any) string {
	str, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(str)
}

func stringPtr(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func toModelLifecycleInfo(model map[string]any, fallbackModelID string) *ModelLifecycleInfo {
	lifecycle := asMap(model["lifecycle"])
	modelID := firstNonEmpty(asString(model["model_id"]), fallbackModelID)
	sourceStatus := firstNonEmpty(asString(model["status"]), asString(lifecycle["status"]))
	deprecationDate := firstNonEmpty(asString(lifecycle["deprecation_date"]), asString(model["deprecation_date"]))
	retirementDate := firstNonEmpty(asString(lifecycle["retirement_date"]), asString(model["retirement_date"]))
	status := normalizeLifecycleStatus(
		firstNonEmpty(asString(lifecycle["status"]), asString(model["status"])),
		deprecationDate,
		retirementDate,
	)
	replacementModelID := firstNonEmpty(asString(lifecycle["replacement_model_id"]))
	message := firstNonEmpty(
		asString(lifecycle["message"]),
		buildLifecycleMessage(status, modelID, stringPtr(deprecationDate), stringPtr(retirementDate), stringPtr(replacementModelID)),
	)

	return &ModelLifecycleInfo{
		ModelID:            modelID,
		Status:             status,
		SourceStatus:       stringPtr(sourceStatus),
		DeprecationDate:    stringPtr(deprecationDate),
		RetirementDate:     stringPtr(retirementDate),
		ReplacementModelID: stringPtr(replacementModelID),
		Message:            stringPtr(message),
	}
}

func normalizeLifecycleStatus(status string, deprecationDate string, retirementDate string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "active", "deprecated", "retired":
		return strings.ToLower(strings.TrimSpace(status))
	}
	now := time.Now().UTC()
	if retirementAt, err := time.Parse(time.RFC3339, retirementDate); err == nil && !retirementAt.After(now) {
		return "retired"
	}
	if deprecatedAt, err := time.Parse(time.RFC3339, deprecationDate); err == nil && !deprecatedAt.After(now) {
		return "deprecated"
	}
	return "active"
}

func buildLifecycleMessage(
	status string,
	modelID string,
	deprecationDate *string,
	retirementDate *string,
	replacementModelID *string,
) string {
	replacement := ""
	if replacementModelID != nil {
		replacement = fmt.Sprintf(` Use "%s" instead.`, *replacementModelID)
	}
	switch status {
	case "retired":
		if retirementDate != nil {
			return fmt.Sprintf(`[phaseo] Model "%s" is retired as of %s.%s`, modelID, *retirementDate, replacement)
		}
		return fmt.Sprintf(`[phaseo] Model "%s" is retired.%s`, modelID, replacement)
	case "deprecated":
		if retirementDate != nil {
			return fmt.Sprintf(`[phaseo] Model "%s" is deprecated and scheduled for retirement on %s.%s`, modelID, *retirementDate, replacement)
		}
		if deprecationDate != nil {
			return fmt.Sprintf(`[phaseo] Model "%s" has been deprecated since %s.%s`, modelID, *deprecationDate, replacement)
		}
		return fmt.Sprintf(`[phaseo] Model "%s" is deprecated.%s`, modelID, replacement)
	default:
		return ""
	}
}

func normalizeSourceStatus(value *string) string {
	if value == nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(*value))
}

func isModelRequestableForInference(info *ModelLifecycleInfo) bool {
	if info == nil || info.Status != "active" {
		return false
	}
	sourceStatus := normalizeSourceStatus(info.SourceStatus)
	if sourceStatus == "" {
		return true
	}
	if _, ok := activeModelSourceStatuses[sourceStatus]; ok {
		return true
	}
	if _, ok := inactiveModelSourceStatuses[sourceStatus]; ok {
		return false
	}
	return false
}

func buildInactiveModelRequestMessage(info *ModelLifecycleInfo) string {
	if info == nil {
		return `[phaseo] Model "unknown-model" is not active for inference.`
	}

	if info.Status != "active" {
		if info.Message != nil && strings.TrimSpace(*info.Message) != "" {
			return *info.Message
		}
		fallback := buildLifecycleMessage(
			info.Status,
			info.ModelID,
			info.DeprecationDate,
			info.RetirementDate,
			info.ReplacementModelID,
		)
		if strings.TrimSpace(fallback) != "" {
			return fallback
		}
		return fmt.Sprintf(`[phaseo] Model "%s" is not active for inference.`, info.ModelID)
	}

	sourceStatus := normalizeSourceStatus(info.SourceStatus)
	if sourceStatus == "" {
		sourceStatus = "unknown"
	}
	replacement := ""
	if info.ReplacementModelID != nil {
		replacement = fmt.Sprintf(` Use "%s" instead.`, *info.ReplacementModelID)
	}
	return fmt.Sprintf(
		`[phaseo] Model "%s" is not active for inference (status: %s).%s`,
		info.ModelID,
		sourceStatus,
		replacement,
	)
}
