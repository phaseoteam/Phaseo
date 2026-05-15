package aistatsagent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	aistats "github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go"
	gen "github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go/src/gen"
)

type ToolCall struct {
	ID    string
	Name  string
	Input any
}

type Message struct {
	Role       string
	Content    string
	ToolCalls  []ToolCall
	ToolCallID string
	Name       string
}

type Tool struct {
	ID          string
	Description string
	Parameters  map[string]any
	Execute     func(input any, ctx RuntimeContext) (any, error)
}

type RuntimeContext struct {
	RunID     string
	AgentID   string
	StepIndex int
	Context   any
}

type ModelRequest struct {
	AgentID      string
	Model        string
	Instructions string
	Messages     []Message
	Tools        []Tool
	Context      any
}

type ModelResponse struct {
	Message      Message
	Usage        map[string]any
	RequestID    string
	Provider     string
	Model        string
	ResponseMeta map[string]any
}

type ModelClient interface {
	Generate(ctx context.Context, request ModelRequest) (ModelResponse, error)
}

type AgentDefinition struct {
	ID           string
	Model        string
	Preset       string
	Instructions string
	Tools        []Tool
	MaxSteps     int
	ParseOutput  func(string) (any, error)
}

type Agent struct {
	definition AgentDefinition
}

type RunStep struct {
	Index     int
	ToolCalls []ToolCall
	RequestID string
	Provider  string
	Model     string
}

type RunRecord struct {
	ID        string
	AgentID   string
	Status    string
	Input     any
	Messages  []Message
	StepCount int
	Result    any
	Error     string
}

type RunResult struct {
	Run      RunRecord
	Steps    []RunStep
	Output   any
	Messages []Message
}

type RunOptions struct {
	Input    any
	Client   ModelClient
	Context  any
	Model    string
	MaxSteps int
}

type GatewayAgentClientOptions struct {
	Client           *aistats.AIStats
	APIKey           string
	BaseURL          string
	Model            string
	Preset           string
	Provider         map[string]any
	Reasoning        map[string]any
	Temperature      *float64
	MaxOutputTokens  *int
	ParallelToolCall *bool
	Metadata         map[string]string
	User             string
	IncludeMeta      *bool
	GatewayTools     []map[string]any
	ToolChoice       any
	ProviderOptions  map[string]any
	PromptCacheKey   string
}

func DefineTool(tool Tool) Tool {
	return tool
}

func CreateAgent(definition AgentDefinition) *Agent {
	if definition.MaxSteps <= 0 {
		definition.MaxSteps = 8
	}
	return &Agent{definition: definition}
}

func toPresetAlias(value string) string {
	normalized := strings.TrimSpace(strings.TrimLeft(value, "@"))
	if normalized == "" {
		return ""
	}
	return "@" + normalized
}

func stringify(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	data, _ := json.Marshal(value)
	return string(data)
}

func toResponsesInput(messages []Message) []map[string]any {
	items := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		if message.Role == "system" {
			continue
		}
		if message.Role == "tool" {
			items = append(items, map[string]any{
				"type":    "function_call_output",
				"call_id": message.ToolCallID,
				"output":  stringify(message.Content),
			})
			continue
		}

		base := map[string]any{
			"type":    "message",
			"role":    message.Role,
			"content": stringify(message.Content),
		}
		if message.Role == "assistant" && len(message.ToolCalls) > 0 {
			toolCalls := make([]map[string]any, 0, len(message.ToolCalls))
			for _, toolCall := range message.ToolCalls {
				rawArgs, _ := json.Marshal(toolCall.Input)
				toolCalls = append(toolCalls, map[string]any{
					"id":   toolCall.ID,
					"type": "function",
					"function": map[string]any{
						"name":      toolCall.Name,
						"arguments": string(rawArgs),
					},
				})
			}
			base["tool_calls"] = toolCalls
		}
		items = append(items, base)
	}
	return items
}

func toInstructions(messages []Message, override string) string {
	systemParts := make([]string, 0)
	for _, message := range messages {
		if message.Role == "system" && strings.TrimSpace(message.Content) != "" {
			systemParts = append(systemParts, strings.TrimSpace(message.Content))
		}
	}
	systemText := strings.Join(systemParts, "\n\n")
	if override != "" && systemText != "" {
		return override + "\n\n" + systemText
	}
	if override != "" {
		return override
	}
	return systemText
}

func safeParseToolInput(raw string) any {
	if strings.TrimSpace(raw) == "" {
		return map[string]any{}
	}
	var decoded any
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		return map[string]any{"raw": raw}
	}
	return decoded
}

func extractToolCalls(response gen.ResponsesResponse) []ToolCall {
	if response.OutputItems == nil {
		return nil
	}
	calls := make([]ToolCall, 0)
	for index, item := range *response.OutputItems {
		itemType := strings.ToLower(stringValue(item["type"]))
		if itemType != "function_call" {
			continue
		}
		callID := stringValue(item["call_id"])
		if callID == "" {
			callID = fmt.Sprintf("tool_call_%d", index)
		}
		calls = append(calls, ToolCall{
			ID:    callID,
			Name:  stringValue(item["name"]),
			Input: safeParseToolInput(stringValue(item["arguments"])),
		})
	}
	return calls
}

func extractAssistantText(response gen.ResponsesResponse) string {
	if response.OutputItems == nil {
		return ""
	}
	parts := make([]string, 0)
	for _, item := range *response.OutputItems {
		if strings.ToLower(stringValue(item["type"])) != "message" {
			continue
		}
		contentParts, _ := item["content"].([]any)
		for _, contentPart := range contentParts {
			partMap, _ := contentPart.(map[string]any)
			if strings.ToLower(stringValue(partMap["type"])) == "output_text" {
				if text := stringValue(partMap["text"]); text != "" {
					parts = append(parts, text)
				}
			}
		}
	}
	return strings.Join(parts, "\n\n")
}

func stringValue(value any) string {
	if value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return fmt.Sprint(value)
}

type GatewayAgentClient struct {
	client  *aistats.AIStats
	options GatewayAgentClientOptions
}

func CreateGatewayAgentClient(options GatewayAgentClientOptions) (*GatewayAgentClient, error) {
	client := options.Client
	if client == nil {
		apiKey := strings.TrimSpace(options.APIKey)
		if apiKey == "" {
			apiKey = strings.TrimSpace(os.Getenv("AI_STATS_API_KEY"))
		}
		if apiKey == "" {
			return nil, errors.New("AI_STATS_API_KEY is required")
		}
		baseURL := strings.TrimSpace(options.BaseURL)
		if baseURL == "" {
			baseURL = strings.TrimSpace(os.Getenv("AI_STATS_BASE_URL"))
		}
		client = aistats.New(apiKey, baseURL)
	}
	return &GatewayAgentClient{client: client, options: options}, nil
}

func (g *GatewayAgentClient) Generate(ctx context.Context, request ModelRequest) (ModelResponse, error) {
	model := request.Model
	if model == "" {
		model = g.options.Model
	}
	if model == "" {
		model = toPresetAlias(g.options.Preset)
	}
	if model == "" {
		model = "ai-stats/free"
	}

	tools := make([]interface{}, 0, len(request.Tools)+len(g.options.GatewayTools))
	for _, tool := range request.Tools {
		parameters := tool.Parameters
		if parameters == nil {
			parameters = map[string]any{"type": "object", "additionalProperties": true}
		}
		tools = append(tools, map[string]any{
			"type": "function",
			"function": map[string]any{
				"name":        tool.ID,
				"description": tool.Description,
				"parameters":  parameters,
			},
		})
	}
	for _, tool := range g.options.GatewayTools {
		tools = append(tools, tool)
	}

	var metadata *map[string]interface{}
	if g.options.Metadata != nil {
		coerced := make(map[string]interface{}, len(g.options.Metadata))
		for key, value := range g.options.Metadata {
			coerced[key] = value
		}
		metadata = &coerced
	}

	req := gen.ResponsesRequest{
		Model:        model,
		Input:        toResponsesInput(request.Messages),
		Instructions: stringPtr(toInstructions(request.Messages, request.Instructions)),
		Tools:        &tools,
	}
	if g.options.ParallelToolCall != nil {
		req.ParallelToolCalls = g.options.ParallelToolCall
	}
	if g.options.Temperature != nil {
		req.Temperature = g.options.Temperature
	}
	if g.options.MaxOutputTokens != nil {
		req.MaxOutputTokens = g.options.MaxOutputTokens
	}
	if g.options.Provider != nil {
		req.Provider = &g.options.Provider
	}
	if g.options.Reasoning != nil {
		req.Reasoning = &g.options.Reasoning
	}
	if metadata != nil {
		req.Metadata = metadata
	}
	if g.options.User != "" {
		req.User = &g.options.User
	}
	if g.options.IncludeMeta != nil {
		req.Meta = g.options.IncludeMeta
	}
	if g.options.ToolChoice != nil {
		req.ToolChoice = &g.options.ToolChoice
	}
	if g.options.ProviderOptions != nil {
		req.ProviderOptions = &g.options.ProviderOptions
	}
	if g.options.PromptCacheKey != "" {
		req.PromptCacheKey = &g.options.PromptCacheKey
	}

	response, err := g.client.CreateResponse(ctx, req)
	if err != nil {
		return ModelResponse{}, err
	}

	return ModelResponse{
		Message: Message{
			Role:      "assistant",
			Content:   extractAssistantText(response),
			ToolCalls: extractToolCalls(response),
		},
		RequestID: stringPointerValue(response.Id),
		Model:     stringPointerValue(response.Model),
	}, nil
}

func (a *Agent) Run(ctx context.Context, options RunOptions) (RunResult, error) {
	runID := fmt.Sprintf("run_%d", os.Getpid())
	messages := make([]Message, 0, 4)
	if strings.TrimSpace(a.definition.Instructions) != "" {
		messages = append(messages, Message{Role: "system", Content: a.definition.Instructions})
	}
	messages = append(messages, Message{Role: "user", Content: stringify(options.Input)})
	steps := make([]RunStep, 0)
	maxSteps := options.MaxSteps
	if maxSteps <= 0 {
		maxSteps = a.definition.MaxSteps
	}
	if maxSteps <= 0 {
		maxSteps = 8
	}
	toolsByID := make(map[string]Tool, len(a.definition.Tools))
	for _, tool := range a.definition.Tools {
		toolsByID[tool.ID] = tool
	}

	run := RunRecord{
		ID:       runID,
		AgentID:  a.definition.ID,
		Status:   "running",
		Input:    options.Input,
		Messages: messages,
	}

	for stepIndex := 0; stepIndex < maxSteps; stepIndex++ {
		response, err := options.Client.Generate(ctx, ModelRequest{
			AgentID:      a.definition.ID,
			Model:        firstNonEmpty(options.Model, a.definition.Model, toPresetAlias(a.definition.Preset)),
			Instructions: a.definition.Instructions,
			Messages:     messages,
			Tools:        a.definition.Tools,
			Context:      options.Context,
		})
		if err != nil {
			run.Status = "failed"
			run.Error = err.Error()
			return RunResult{}, err
		}
		messages = append(messages, response.Message)
		steps = append(steps, RunStep{
			Index:     stepIndex,
			ToolCalls: response.Message.ToolCalls,
			RequestID: response.RequestID,
			Provider:  response.Provider,
			Model:     response.Model,
		})

		if len(response.Message.ToolCalls) == 0 {
			var output any = response.Message.Content
			if a.definition.ParseOutput != nil {
				parsed, err := a.definition.ParseOutput(response.Message.Content)
				if err != nil {
					return RunResult{}, err
				}
				output = parsed
			}
			run.Status = "completed"
			run.Messages = messages
			run.StepCount = len(steps)
			run.Result = output
			return RunResult{Run: run, Steps: steps, Output: output, Messages: messages}, nil
		}

		for _, toolCall := range response.Message.ToolCalls {
			tool, ok := toolsByID[toolCall.Name]
			if !ok {
				return RunResult{}, fmt.Errorf("unknown tool %q", toolCall.Name)
			}
			output, err := tool.Execute(toolCall.Input, RuntimeContext{
				RunID:     runID,
				AgentID:   a.definition.ID,
				StepIndex: stepIndex,
				Context:   options.Context,
			})
			if err != nil {
				return RunResult{}, err
			}
			messages = append(messages, Message{
				Role:       "tool",
				Name:       tool.ID,
				ToolCallID: toolCall.ID,
				Content:    stringify(output),
			})
		}
	}

	return RunResult{}, fmt.Errorf("agent exceeded max_steps=%d", maxSteps)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func stringPtr(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func stringPointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
