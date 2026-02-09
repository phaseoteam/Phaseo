package aistats

import (
	"context"
	"encoding/json"

	gen "github.com/AI-Stats/ai-stats-go-sdk-wrapper/src/gen"
)

// Client is a thin facade over the generated Go client in src/gen.
type Client struct {
	raw *gen.Client
}

// New creates a new API client targeting the given base URL with a bearer token.
func New(apiKey string, baseURL string) *Client {
	raw := gen.NewClient(baseURL)
	raw.Headers["Authorization"] = "Bearer " + apiKey
	return &Client{raw: raw}
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

// GetModels calls /models.
func (c *Client) GetModels(_ context.Context, query map[string]string) (map[string]interface{}, error) {
	return gen.ListModels(c.raw, nil, query, nil, nil)
}

// GenerateText calls /chat/completions.
func (c *Client) GenerateText(_ context.Context, req gen.ChatCompletionsRequest) (map[string]interface{}, error) {
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
	if req.MaxOutputTokens != nil {
		body["max_output_tokens"] = *req.MaxOutputTokens
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
	return gen.CreateChatCompletion(c.raw, nil, nil, nil, body)
}

// GenerateResponse calls /responses.
func (c *Client) GenerateResponse(_ context.Context, req gen.ResponsesRequest) (gen.ResponsesResponse, error) {
	raw, err := gen.CreateResponse(c.raw, nil, nil, nil, req)
	if err != nil {
		var zero gen.ResponsesResponse
		return zero, err
	}
	return decodeTo[gen.ResponsesResponse](raw)
}

// GenerateEmbedding calls /embeddings.
func (c *Client) GenerateEmbedding(_ context.Context, req any) (map[string]interface{}, error) {
	return gen.CreateEmbedding(c.raw, nil, nil, nil, req)
}

// GenerateModeration calls /moderations.
func (c *Client) GenerateModeration(_ context.Context, req any) (map[string]interface{}, error) {
	return gen.CreateModeration(c.raw, nil, nil, nil, req)
}
