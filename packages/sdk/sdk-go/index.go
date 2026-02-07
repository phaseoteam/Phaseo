package aistats

// This is a lightweight facade over the generated Go SDK.
// Only the models endpoint is exposed for now.
// Generate the client with: `pnpm openapi:gen:go`
// The generated package name is set to `ai_stats_sdk` in go.codegen.yaml.

import (
	"context"

	gen "github.com/AI-Stats/ai-stats-go-sdk"
)

// Client provides a thin, typed facade over the generated SDK.
type Client struct {
	Models      *gen.ModelsAPIService
	Completions *gen.CompletionsAPIService
	Responses   *gen.ResponsesAPIService
	Audio       *gen.AudioAPIService
	Images      *gen.ImagesAPIService
	Moderations *gen.ModerationsAPIService
	Video       *gen.VideoAPIService
	Batch       *gen.BatchAPIService
	Files       *gen.FilesAPIService
	Analytics   *gen.AnalyticsAPIService
}

// New creates a new API client targeting the given base URL with a bearer token.
func New(apiKey string, baseURL string) *Client {
	cfg := gen.NewConfiguration()
	cfg.Servers = gen.ServerConfigurations{{URL: baseURL}}
	cfg.AddDefaultHeader("Authorization", "Bearer "+apiKey)
	apiClient := gen.NewAPIClient(cfg)
	return &Client{
		Models:      apiClient.ModelsAPI,
		Completions: apiClient.CompletionsAPI,
		Responses:   apiClient.ResponsesAPI,
		Audio:       apiClient.AudioAPI,
		Images:      apiClient.ImagesAPI,
		Moderations: apiClient.ModerationsAPI,
		Video:       apiClient.VideoAPI,
		Batch:       apiClient.BatchAPI,
		Files:       apiClient.FilesAPI,
		Analytics:   apiClient.AnalyticsAPI,
	}
}

// GetModels retrieves the model catalogue with optional filters.
func (c *Client) GetModels(ctx context.Context, params *gen.ModelsGetRequest) (gen.ModelListResponse, *gen.APIResponse, error) {
	if params == nil {
		params = &gen.ModelsGetRequest{}
	}
	return c.Models.ModelsGet(ctx, params)
}

// GenerateText calls /chat/completions.
func (c *Client) GenerateText(ctx context.Context, req gen.ChatCompletionsRequest) (gen.ChatCompletionsResponse, *gen.APIResponse, error) {
	return c.Completions.CreateChatCompletion(ctx).ChatCompletionsRequest(req).Execute()
}

// GenerateResponse calls /responses.
func (c *Client) GenerateResponse(ctx context.Context, req gen.ResponsesRequest) (gen.ResponsesResponse, *gen.APIResponse, error) {
	return c.Responses.CreateResponse(ctx).ResponsesRequest(req).Execute()
}

// CreateBatch creates a batch job.
func (c *Client) CreateBatch(ctx context.Context, req gen.BatchRequest) (gen.BatchResponse, *gen.APIResponse, error) {
	return c.Batch.CreateBatch(ctx).BatchRequest(req).Execute()
}

// GetBatch retrieves a batch job by id.
func (c *Client) GetBatch(ctx context.Context, batchID string) (gen.BatchResponse, *gen.APIResponse, error) {
	return c.Batch.RetrieveBatch(ctx, batchID).Execute()
}

// GenerateImage calls /images/generations.
func (c *Client) GenerateImage(ctx context.Context, req gen.ImagesGenerationRequest) (gen.ImagesGenerationResponse, *gen.APIResponse, error) {
	return c.Images.CreateImage(ctx).ImagesGenerationRequest(req).Execute()
}

// GenerateImageEdit calls /images/edits.
func (c *Client) GenerateImageEdit(ctx context.Context, model string, image string, prompt string, mask *string, size *string, n *int32, user *string, meta *bool, usage *bool) (gen.ImagesEditResponse, *gen.APIResponse, error) {
	return c.Images.CreateImageEdit(ctx).Model(model).Image(image).Prompt(prompt).Mask(mask).Size(size).N(n).User(user).Meta(meta).Usage(usage).Execute()
}

// GenerateEmbedding calls /embeddings.
func (c *Client) GenerateEmbedding(ctx context.Context, req gen.EmbeddingsRequest) (gen.EmbeddingsResponse, *gen.APIResponse, error) {
	return c.Completions.CreateEmbedding(ctx).EmbeddingsRequest(req).Execute()
}

// GenerateModeration calls /moderations.
func (c *Client) GenerateModeration(ctx context.Context, req gen.ModerationsRequest) (gen.ModerationsResponse, *gen.APIResponse, error) {
	return c.Moderations.CreateModeration(ctx).ModerationsRequest(req).Execute()
}

// GenerateSpeech calls /audio/speech.
func (c *Client) GenerateSpeech(ctx context.Context, req gen.AudioSpeechRequest) ([]byte, *gen.APIResponse, error) {
	return c.Audio.CreateSpeech(ctx).AudioSpeechRequest(req).Execute()
}

// GenerateTranscription calls /audio/transcriptions.
func (c *Client) GenerateTranscription(ctx context.Context, model string, audioUrl *string, audioB64 *string, language *string) (gen.AudioTranscriptionResponse, *gen.APIResponse, error) {
	return c.Audio.CreateTranscription(ctx, model).AudioUrl(audioUrl).AudioB64(audioB64).Language(language).Execute()
}

// GenerateTranslation calls /audio/translations.
func (c *Client) GenerateTranslation(ctx context.Context, model string, audioUrl *string, audioB64 *string, language *string, prompt *string, temperature *float32) (gen.AudioTranslationResponse, *gen.APIResponse, error) {
	return c.Audio.CreateTranslation(ctx, model).AudioUrl(audioUrl).AudioB64(audioB64).Language(language).Prompt(prompt).Temperature(temperature).Execute()
}
