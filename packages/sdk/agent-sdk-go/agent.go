package phaseoagent

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	phaseo "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3"
	gen "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3/src/gen"
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
	IsError    bool
}

type Validator func(any) (any, error)
type ApprovalPredicate func(any, RuntimeContext) (bool, error)
type NextTurnParams struct {
	Model, Instructions string
	Temperature, TopP   *float64
	MaxOutputTokens     *int
	Tools               []Tool
}
type TurnContext struct {
	NumberOfTurns, StepIndex int
	Messages                 []Message
	Context                  any
	LastToolCall             *ToolCall
}

type Tool struct {
	ID                 string
	Description        string
	Parameters         map[string]any
	Execute            func(input any, ctx RuntimeContext) (any, error)
	Timeout            time.Duration
	InputSchema        Validator
	OutputSchema       Validator
	EventSchema        Validator
	RequireApproval    bool
	Approval           ApprovalPredicate
	OnToolCalled       func(any, RuntimeContext) (any, bool, error)
	OnResponseReceived func(any, RuntimeContext) (any, error)
	NextTurn           *NextTurnParams
	OnError            string
}

type RuntimeContext struct {
	RunID        string
	AgentID      string
	StepIndex    int
	Context      any
	ToolCall     ToolCall
	EmitProgress func(any) error
	SetContext   func(any)
}

type ModelRequest struct {
	AgentID         string
	Model           string
	Instructions    string
	Messages        []Message
	Tools           []Tool
	Context         any
	Temperature     *float64
	MaxOutputTokens *int
	TopP            *float64
	Stream          bool
}

type ModelResponse struct {
	Message          Message
	Usage            map[string]any
	RequestID        string
	NativeResponseID string
	Provider         string
	Model            string
	ResponseMeta     map[string]any
	FinishReason     string
	Cost             float64
	Warnings         []map[string]string
}

type ModelClient interface {
	Generate(ctx context.Context, request ModelRequest) (ModelResponse, error)
}
type ModelStreamEvent struct {
	Type, Delta string
	Item        any
	Response    *ModelResponse
	Err         error
}
type StreamingModelClient interface {
	ModelClient
	Stream(context.Context, ModelRequest) <-chan ModelStreamEvent
}

type AgentDefinition struct {
	ID                  string
	Model               string
	Preset              string
	Instructions        string
	Tools               []Tool
	MaxSteps            int
	ParseOutput         func(string) (any, error)
	HumanReview         func(HumanReviewContext) *HumanReviewRequest
	ModelRetry          ModelRetryConfig
	ToolExecution       ToolExecutionConfig
	StopWhen            []StopCondition
	RequireApproval     func(ToolCall, RuntimeContext) (bool, error)
	OutputSchema        Validator
	DynamicModel        func(TurnContext) string
	DynamicInstructions func(TurnContext) string
	Temperature         func(TurnContext) *float64
	MaxOutputTokens     func(TurnContext) *int
	TopP                func(TurnContext) *float64
	DynamicTools        func(TurnContext) []Tool
}

type Agent struct {
	definition AgentDefinition
}

type RunStep struct {
	Index            int
	Status           string
	ToolCalls        []ToolCall
	RequestID        string
	NativeResponseID string
	Provider         string
	Model            string
	ModelAttempts    int
	Usage            map[string]any
	ResponseMeta     map[string]any
	Error            string
	FinishReason     string
	Warnings         []map[string]string
}

type RunRecord struct {
	ID         string
	AgentID    string
	Status     string
	Input      any
	Messages   []Message
	StepCount  int
	Result     any
	Error      string
	Context    any
	Pause      *HumanPause
	CreatedAt  string
	UpdatedAt  string
	StopReason string
	Usage      UsageSummary
	NextTurn   *NextTurnParams
}

type RunResult struct {
	Run      RunRecord
	Steps    []RunStep
	Output   any
	Messages []Message
	Usage    UsageSummary
}

type RunOptions struct {
	Input         any
	Client        ModelClient
	Context       any
	Model         string
	MaxSteps      int
	Preset        string
	ModelRetry    *ModelRetryConfig
	ToolExecution *ToolExecutionConfig
	OnEvent       EventHandler
	Devtools      *DevtoolsConfig
	State         StateAccessor
}

type ContinueOptions struct {
	Run           RunResult
	RunID         string
	Client        ModelClient
	Context       any
	Model         string
	Preset        string
	MaxSteps      int
	HumanInput    string
	ModelRetry    *ModelRetryConfig
	ToolExecution *ToolExecutionConfig
	OnEvent       EventHandler
	Devtools      *DevtoolsConfig
	Approvals     []ToolDecision
	Rejections    []ToolDecision
	ToolOutputs   []ToolOutput
	State         StateAccessor
}

type StreamResult struct {
	mu     sync.Mutex
	cond   *sync.Cond
	events []AgentEvent
	result *RunResult
	err    error
	cancel context.CancelFunc
}

func newStreamResult(cancel context.CancelFunc) *StreamResult {
	value := &StreamResult{cancel: cancel}
	value.cond = sync.NewCond(&value.mu)
	return value
}
func (s *StreamResult) Cancel() {
	if s.cancel != nil {
		s.cancel()
	}
}
func (s *StreamResult) push(event AgentEvent) {
	s.mu.Lock()
	s.events = append(s.events, event)
	s.cond.Broadcast()
	s.mu.Unlock()
}
func (s *StreamResult) finish(result RunResult, err error) {
	s.mu.Lock()
	s.result = &result
	s.err = err
	s.cond.Broadcast()
	s.mu.Unlock()
}
func (s *StreamResult) Result() (RunResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for s.result == nil && s.err == nil {
		s.cond.Wait()
	}
	if s.err != nil {
		return RunResult{}, s.err
	}
	return *s.result, nil
}
func (s *StreamResult) Events() <-chan AgentEvent {
	out := make(chan AgentEvent)
	go func() {
		defer close(out)
		index := 0
		for {
			s.mu.Lock()
			for index >= len(s.events) && s.result == nil && s.err == nil {
				s.cond.Wait()
			}
			if index < len(s.events) {
				event := s.events[index]
				index++
				s.mu.Unlock()
				out <- event
				continue
			}
			s.mu.Unlock()
			return
		}
	}()
	return out
}
func (s *StreamResult) Text() <-chan string {
	out := make(chan string)
	go func() {
		defer close(out)
		for event := range s.Events() {
			if event.Type == "response.output_text.delta" {
				if delta, ok := event.Details["delta"].(string); ok {
					out <- delta
				}
			}
		}
	}()
	return out
}

type PendingToolCall struct {
	Call         ToolCall
	Kind, Reason string
}
type ToolDecision struct{ ToolCallID, Reason string }
type ToolOutput struct {
	ToolCallID string
	Output     any
}
type UsageSummary struct {
	InputTokens, OutputTokens, CachedTokens, TotalTokens int
	Cost                                                 float64
}
type StopState struct {
	StepCount    int
	Usage        UsageSummary
	ToolCalls    []ToolCall
	FinishReason string
	Elapsed      time.Duration
}
type StopCondition func(StopState) (string, bool)
type StateAccessor interface {
	Load(context.Context, string) (*RunResult, error)
	Save(context.Context, RunResult) error
}

type ModelRetryConfig struct {
	MaxRetries int
	Backoff    time.Duration
}
type ToolExecutionConfig struct{ Concurrency int }
type HumanReviewRequest struct {
	Reason  string
	Payload any
}
type HumanPause struct {
	Reason           string
	Payload          any
	RequestedAt      string
	Kind             string
	PendingToolCalls []PendingToolCall
}
type HumanReviewContext struct {
	RunID        string
	AgentID      string
	StepIndex    int
	Input        any
	Context      any
	Messages     []Message
	Response     ModelResponse
	ParsedOutput any
}
type AgentEvent struct {
	Type      string         `json:"type"`
	RunID     string         `json:"run_id"`
	AgentID   string         `json:"agent_id"`
	Timestamp string         `json:"timestamp"`
	Status    string         `json:"status"`
	Details   map[string]any `json:"details,omitempty"`
}
type EventHandler func(AgentEvent)
type DevtoolsConfig struct {
	Enabled   bool
	Directory string
}

func CreateAgentDevtools(directory string) *DevtoolsConfig {
	return &DevtoolsConfig{Enabled: true, Directory: directory}
}

type GatewayAgentClientOptions struct {
	Client           *phaseo.Phaseo
	HTTPClient       *http.Client
	Headers          map[string]string
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
	ConfigureRequest func(*gen.ResponsesRequest)
}

func DefineTool(tool Tool) Tool {
	return tool
}

func StepCountIs(limit int) StopCondition {
	return func(state StopState) (string, bool) {
		return fmt.Sprintf("step_count:%d", limit), state.StepCount >= limit
	}
}
func MaxTokensUsed(limit int) StopCondition {
	return func(state StopState) (string, bool) {
		return fmt.Sprintf("max_tokens:%d", limit), state.Usage.TotalTokens >= limit
	}
}
func MaxCost(limit float64) StopCondition {
	return func(state StopState) (string, bool) {
		return fmt.Sprintf("max_cost:%g", limit), state.Usage.Cost >= limit
	}
}
func HasToolCall(name string) StopCondition {
	return func(state StopState) (string, bool) {
		for _, call := range state.ToolCalls {
			if call.Name == name {
				return "tool_call:" + name, true
			}
		}
		return "", false
	}
}
func FinishReasonIs(reason string) StopCondition {
	return func(state StopState) (string, bool) { return "finish_reason:" + reason, state.FinishReason == reason }
}
func MaxDuration(limit time.Duration) StopCondition {
	return func(state StopState) (string, bool) { return "max_duration:" + limit.String(), state.Elapsed >= limit }
}

func validate(schema Validator, value any, label string) (any, error) {
	if schema == nil {
		return value, nil
	}
	checked, err := schema(value)
	if err != nil {
		return nil, fmt.Errorf("invalid %s: %w", label, err)
	}
	return checked, nil
}

func normalizedUsage(response ModelResponse) UsageSummary {
	integer := func(keys ...string) int {
		for _, key := range keys {
			if value, ok := response.Usage[key]; ok {
				switch typed := value.(type) {
				case int:
					return typed
				case float64:
					return int(typed)
				case json.Number:
					result, _ := typed.Int64()
					return int(result)
				}
			}
		}
		return 0
	}
	input, output := integer("input_tokens", "prompt_tokens"), integer("output_tokens", "completion_tokens")
	total := integer("total_tokens")
	if total == 0 {
		total = input + output
	}
	return UsageSummary{InputTokens: input, OutputTokens: output, CachedTokens: integer("cached_tokens", "cache_read_input_tokens"), TotalTokens: total, Cost: response.Cost}
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
	client     *phaseo.Phaseo
	options    GatewayAgentClientOptions
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

func CreateGatewayAgentClient(options GatewayAgentClientOptions) (*GatewayAgentClient, error) {
	client := options.Client
	apiKey := strings.TrimSpace(options.APIKey)
	if apiKey == "" {
		apiKey = strings.TrimSpace(os.Getenv("PHASEO_API_KEY"))
	}
	baseURL := strings.TrimSpace(options.BaseURL)
	if baseURL == "" {
		baseURL = strings.TrimSpace(os.Getenv("PHASEO_BASE_URL"))
	}
	if baseURL == "" {
		baseURL = "https://api.phaseo.app/v1"
	}
	if client == nil {
		if apiKey == "" {
			return nil, errors.New("PHASEO_API_KEY is required")
		}
		client = phaseo.New(apiKey, baseURL)
		client.RawClient().Headers["X-Phaseo-Client"] = "phaseo-agent-go"
		client.RawClient().Headers["X-Phaseo-Client-Version"] = "0.3.0"
	}
	httpClient := options.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &GatewayAgentClient{client: client, options: options, apiKey: apiKey, baseURL: strings.TrimRight(baseURL, "/"), httpClient: httpClient}, nil
}

func toGatewayModelResponse(response gen.ResponsesResponse) ModelResponse {
	rawBytes, _ := json.Marshal(response)
	raw := map[string]any{}
	_ = json.Unmarshal(rawBytes, &raw)
	usage := map[string]any{}
	if response.Usage != nil {
		usage = *response.Usage
	}
	meta, _ := raw["meta"].(map[string]any)
	firstNumber := func(values ...any) float64 {
		for _, value := range values {
			if number, ok := value.(float64); ok {
				return number
			}
		}
		return 0
	}
	cost := firstNumber(raw["cost"], raw["cost_usd"], usage["cost"])
	if cost == 0 {
		cost = firstNumber(raw["cost_nanos"]) / 1_000_000_000
	}
	if meta != nil {
		cost = firstNumber(cost, meta["cost"], meta["cost_usd"])
		if cost == 0 {
			cost = firstNumber(meta["cost_nanos"]) / 1_000_000_000
		}
	}
	warnings := []map[string]string{}
	if values, ok := raw["warnings"].([]any); ok {
		for _, value := range values {
			if item, ok := value.(map[string]any); ok {
				normalized := map[string]string{}
				for key, entry := range item {
					normalized[key] = stringValue(entry)
				}
				warnings = append(warnings, normalized)
			}
		}
	}
	return ModelResponse{
		Message:          Message{Role: "assistant", Content: extractAssistantText(response), ToolCalls: extractToolCalls(response)},
		Usage:            usage,
		RequestID:        firstNonEmpty(stringValue(raw["request_id"]), stringPointerValue(response.Id)),
		NativeResponseID: firstNonEmpty(stringValue(raw["native_response_id"]), stringValue(raw["nativeResponseId"])),
		Provider:         stringValue(raw["provider"]), Model: stringPointerValue(response.Model),
		ResponseMeta: meta, FinishReason: firstNonEmpty(stringValue(raw["finish_reason"]), stringValue(raw["stop_reason"]), stringValue(raw["status"])), Cost: cost, Warnings: warnings,
	}
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
		model = "phaseo/free"
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
	if request.Temperature != nil {
		req.Temperature = request.Temperature
	} else if g.options.Temperature != nil {
		req.Temperature = g.options.Temperature
	}
	if request.MaxOutputTokens != nil {
		req.MaxOutputTokens = request.MaxOutputTokens
	} else if g.options.MaxOutputTokens != nil {
		req.MaxOutputTokens = g.options.MaxOutputTokens
	}
	if request.TopP != nil {
		req.TopP = request.TopP
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
	if g.options.ConfigureRequest != nil {
		g.options.ConfigureRequest(&req)
	}

	response, err := g.client.CreateResponse(ctx, req)
	if err != nil {
		return ModelResponse{}, err
	}

	return toGatewayModelResponse(response), nil
}

func (g *GatewayAgentClient) Stream(ctx context.Context, request ModelRequest) <-chan ModelStreamEvent {
	events := make(chan ModelStreamEvent)
	go func() {
		defer close(events)
		if g.apiKey == "" {
			events <- ModelStreamEvent{Err: errors.New("streaming with a custom Phaseo client requires APIKey or PHASEO_API_KEY")}
			return
		}
		request.Stream = true
		// Reuse request construction and force streaming by capturing the configured request through a shallow clone.
		model := firstNonEmpty(request.Model, g.options.Model, toPresetAlias(g.options.Preset), "phaseo/free")
		tools := make([]interface{}, 0, len(request.Tools)+len(g.options.GatewayTools))
		for _, tool := range request.Tools {
			parameters := tool.Parameters
			if parameters == nil {
				parameters = map[string]any{"type": "object", "additionalProperties": true}
			}
			tools = append(tools, map[string]any{"type": "function", "function": map[string]any{"name": tool.ID, "description": tool.Description, "parameters": parameters}})
		}
		for _, tool := range g.options.GatewayTools {
			tools = append(tools, tool)
		}
		req := gen.ResponsesRequest{Model: model, Input: toResponsesInput(request.Messages), Instructions: stringPtr(toInstructions(request.Messages, request.Instructions)), Tools: &tools, Stream: boolPtr(true)}
		if request.Temperature != nil {
			req.Temperature = request.Temperature
		} else {
			req.Temperature = g.options.Temperature
		}
		if request.MaxOutputTokens != nil {
			req.MaxOutputTokens = request.MaxOutputTokens
		} else {
			req.MaxOutputTokens = g.options.MaxOutputTokens
		}
		req.TopP = request.TopP
		if g.options.Provider != nil {
			req.Provider = &g.options.Provider
		}
		if g.options.Reasoning != nil {
			req.Reasoning = &g.options.Reasoning
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
		if g.options.ConfigureRequest != nil {
			g.options.ConfigureRequest(&req)
		}
		req.Stream = boolPtr(true)
		payload, err := json.Marshal(req)
		if err != nil {
			events <- ModelStreamEvent{Err: err}
			return
		}
		httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, g.baseURL+"/responses", bytes.NewReader(payload))
		if err != nil {
			events <- ModelStreamEvent{Err: err}
			return
		}
		httpRequest.Header.Set("Authorization", "Bearer "+g.apiKey)
		httpRequest.Header.Set("Content-Type", "application/json")
		httpRequest.Header.Set("Accept", "text/event-stream")
		httpRequest.Header.Set("X-Phaseo-Client", "phaseo-agent-go")
		httpRequest.Header.Set("X-Phaseo-Client-Version", "0.3.0")
		for key, value := range g.options.Headers {
			httpRequest.Header.Set(key, value)
		}
		response, err := g.httpClient.Do(httpRequest)
		if err != nil {
			events <- ModelStreamEvent{Err: err}
			return
		}
		defer response.Body.Close()
		if response.StatusCode >= 400 {
			body, _ := io.ReadAll(response.Body)
			events <- ModelStreamEvent{Err: fmt.Errorf("stream request failed: %s: %s", response.Status, strings.TrimSpace(string(body)))}
			return
		}
		scanner := bufio.NewScanner(response.Body)
		scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if !strings.HasPrefix(line, "data:") {
				continue
			}
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if data == "" || data == "[DONE]" {
				continue
			}
			raw := map[string]any{}
			if json.Unmarshal([]byte(data), &raw) != nil {
				continue
			}
			eventType := stringValue(raw["type"])
			delta := stringValue(raw["delta"])
			if delta == "" {
				delta = stringValue(raw["text"])
			}
			event := ModelStreamEvent{Type: eventType, Delta: delta, Item: raw["item"]}
			if eventType == "response.completed" {
				nested, ok := raw["response"].(map[string]any)
				if !ok {
					nested = raw
				}
				encoded, _ := json.Marshal(nested)
				var completed gen.ResponsesResponse
				if json.Unmarshal(encoded, &completed) == nil {
					mapped := toGatewayModelResponse(completed)
					event.Response = &mapped
				}
			}
			select {
			case events <- event:
			case <-ctx.Done():
				return
			}
		}
		if err := scanner.Err(); err != nil && !errors.Is(err, context.Canceled) {
			events <- ModelStreamEvent{Err: err}
		}
	}()
	return events
}

func newRunID() string {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return fmt.Sprintf("run_%d", time.Now().UnixNano())
	}
	return fmt.Sprintf("%x", value)
}

func nowISO() string { return time.Now().UTC().Format(time.RFC3339Nano) }

func emit(handler EventHandler, eventType string, run RunRecord, details map[string]any) {
	if handler != nil {
		handler(AgentEvent{Type: eventType, RunID: run.ID, AgentID: run.AgentID, Timestamp: nowISO(), Status: run.Status, Details: details})
	}
}

func agentErrorInfo(runErr error) map[string]any {
	info := map[string]any{
		"message": runErr.Error(),
		"type":    fmt.Sprintf("%T", runErr),
	}
	var gatewayErr *gen.HTTPError
	if !errors.As(runErr, &gatewayErr) {
		return info
	}
	info["status_code"] = gatewayErr.StatusCode
	payload := map[string]any{}
	_ = json.Unmarshal(gatewayErr.Body, &payload)
	values := map[string]string{
		"request_id":    stringValue(payload["request_id"]),
		"generation_id": stringValue(payload["generation_id"]),
		"code":          firstNonEmpty(stringValue(payload["code"]), stringValue(payload["error"])),
		"error_type":    stringValue(payload["error_type"]),
		"error_origin":  stringValue(payload["error_origin"]),
		"action":        stringValue(payload["action"]),
		"docs_url":      stringValue(payload["docs_url"]),
		"support_url":   stringValue(payload["support_url"]),
	}
	for key, value := range values {
		if value != "" {
			info[key] = value
		}
	}
	if value, ok := payload["retryable"].(bool); ok {
		info["retryable"] = value
	}
	if value, ok := payload["retry_after_seconds"].(float64); ok {
		info["retry_after_seconds"] = int(value)
	}
	if details := payload["details"]; details != nil {
		info["details"] = details
	}
	return info
}

func captureDevtools(definition AgentDefinition, result *RunResult, operation string, started time.Time, config *DevtoolsConfig, runID string, runErr error) {
	enabled := config != nil && config.Enabled
	if !enabled {
		enabled = os.Getenv("PHASEO_DEVTOOLS") == "true"
	}
	if !enabled {
		return
	}
	directory := ".phaseo-devtools"
	if config != nil && config.Directory != "" {
		directory = config.Directory
	} else if value := os.Getenv("PHASEO_DEVTOOLS_DIR"); value != "" {
		directory = value
	}
	_ = os.MkdirAll(filepath.Join(directory, "assets", "images"), 0o755)
	_ = os.MkdirAll(filepath.Join(directory, "assets", "audio"), 0o755)
	_ = os.MkdirAll(filepath.Join(directory, "assets", "video"), 0o755)
	metadataPath := filepath.Join(directory, "metadata.json")
	if _, err := os.Stat(metadataPath); errors.Is(err, os.ErrNotExist) {
		data, _ := json.MarshalIndent(map[string]any{"session_id": newRunID(), "started_at": started.UnixMilli(), "sdk": "go"}, "", "  ")
		_ = os.WriteFile(metadataPath, data, 0o644)
	}
	metadata := map[string]any{"sdk": "go", "agent_id": definition.ID, "run_id": runID}
	entry := map[string]any{
		"id": runID, "type": operation, "timestamp": started.UnixMilli(),
		"request":  map[string]any{"agent_id": definition.ID, "tool_count": len(definition.Tools)},
		"response": result,
		"metadata": metadata,
	}
	if runErr != nil {
		errorInfo := agentErrorInfo(runErr)
		entry["error"] = errorInfo
		for _, key := range []string{"request_id", "generation_id", "code", "error_type", "error_origin", "retryable", "action", "docs_url", "support_url", "retry_after_seconds", "status_code"} {
			if value := errorInfo[key]; value != nil {
				metadata[key] = value
			}
		}
	}
	data, _ := json.Marshal(entry)
	data = append(data, '\n')
	file, err := os.OpenFile(filepath.Join(directory, "generations.jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err == nil {
		_, _ = file.Write(data)
		_ = file.Close()
	}
}

func (a *Agent) Run(ctx context.Context, options RunOptions) (result RunResult, err error) {
	started := time.Now()
	runID := newRunID()
	messages := make([]Message, 0, 4)
	if strings.TrimSpace(a.definition.Instructions) != "" {
		messages = append(messages, Message{Role: "system", Content: a.definition.Instructions})
	}
	messages = append(messages, Message{Role: "user", Content: stringify(options.Input)})
	createdAt := nowISO()
	run := RunRecord{
		ID:        runID,
		AgentID:   a.definition.ID,
		Status:    "queued",
		Input:     options.Input,
		Messages:  messages,
		Context:   options.Context,
		CreatedAt: createdAt,
		UpdatedAt: createdAt,
	}
	emit(options.OnEvent, "run.started", run, nil)
	defer func() {
		captureDevtools(a.definition, func() *RunResult {
			if err == nil {
				return &result
			}
			return nil
		}(), "agent.run", started, options.Devtools, runID, err)
	}()
	result, err = a.execute(ctx, run, nil, options.Client, options.Context, options.Model, options.Preset, options.MaxSteps, options.ModelRetry, options.ToolExecution, options.OnEvent)
	if options.State != nil && (err == nil || result.Run.ID != "") {
		_ = options.State.Save(ctx, result)
	}
	return result, err
}

type streamClientAdapter struct {
	client  StreamingModelClient
	handler EventHandler
}

func (s streamClientAdapter) Generate(ctx context.Context, request ModelRequest) (ModelResponse, error) {
	request.Stream = true
	var completed *ModelResponse
	text := ""
	for event := range s.client.Stream(ctx, request) {
		if event.Err != nil {
			return ModelResponse{}, event.Err
		}
		switch event.Type {
		case "response.output_text.delta":
			text += event.Delta
			emit(s.handler, event.Type, RunRecord{ID: "stream", AgentID: request.AgentID, Status: "running"}, map[string]any{"delta": event.Delta})
		case "response.reasoning.delta":
			emit(s.handler, event.Type, RunRecord{ID: "stream", AgentID: request.AgentID, Status: "running"}, map[string]any{"delta": event.Delta})
		case "response.item":
			emit(s.handler, event.Type, RunRecord{ID: "stream", AgentID: request.AgentID, Status: "running"}, map[string]any{"item": event.Item})
		case "response.completed":
			completed = event.Response
		}
	}
	if completed != nil {
		return *completed, nil
	}
	return ModelResponse{Message: Message{Role: "assistant", Content: text}}, nil
}
func (a *Agent) Stream(ctx context.Context, options RunOptions) *StreamResult {
	streamCtx, cancel := context.WithCancel(ctx)
	stream := newStreamResult(cancel)
	original := options.OnEvent
	options.OnEvent = func(event AgentEvent) {
		stream.push(event)
		if original != nil {
			original(event)
		}
	}
	if client, ok := options.Client.(StreamingModelClient); ok {
		options.Client = streamClientAdapter{client: client, handler: options.OnEvent}
	}
	go func() { result, err := a.Run(streamCtx, options); stream.finish(result, err) }()
	return stream
}

func executeTool(ctx context.Context, tool Tool, call ToolCall, run *RunRecord, stepIndex int, onEvent EventHandler, contextMu *sync.Mutex) (Message, error) {
	checked, err := validate(tool.InputSchema, call.Input, "tool input")
	if err != nil {
		return Message{}, err
	}
	call.Input = checked
	emit(onEvent, "tool.started", *run, map[string]any{"step_index": stepIndex, "tool_call_id": call.ID, "tool_name": call.Name})
	toolCtx, cancel := context.WithCancel(ctx)
	if tool.Timeout > 0 {
		toolCtx, cancel = context.WithTimeout(ctx, tool.Timeout)
	}
	defer cancel()
	type result struct {
		output any
		err    error
	}
	resultCh := make(chan result, 1)
	go func() {
		progress := func(value any) error {
			value, validateErr := validate(tool.EventSchema, value, "tool progress event")
			if validateErr == nil {
				emit(onEvent, "tool.preliminary_result", *run, map[string]any{"step_index": stepIndex, "tool_call_id": call.ID, "tool_name": call.Name, "result": value})
			}
			return validateErr
		}
		contextMu.Lock()
		contextValue := run.Context
		contextMu.Unlock()
		output, executeErr := tool.Execute(call.Input, RuntimeContext{RunID: run.ID, AgentID: run.AgentID, StepIndex: stepIndex, Context: contextValue, ToolCall: call, EmitProgress: progress, SetContext: func(value any) { contextMu.Lock(); run.Context = value; contextMu.Unlock() }})
		if executeErr == nil {
			output, executeErr = validate(tool.OutputSchema, output, "tool output")
		}
		resultCh <- result{output, executeErr}
	}()
	var completed result
	select {
	case completed = <-resultCh:
	case <-toolCtx.Done():
		completed.err = fmt.Errorf("tool %s timed out: %w", call.Name, toolCtx.Err())
	}
	if completed.err != nil {
		emit(onEvent, "tool.failed", *run, map[string]any{"step_index": stepIndex, "tool_call_id": call.ID, "tool_name": call.Name, "error": completed.err.Error()})
		if tool.OnError == "return-to-model" {
			return Message{Role: "tool", Name: tool.ID, ToolCallID: call.ID, Content: stringify(map[string]any{"error": completed.err.Error()}), IsError: true}, nil
		}
		return Message{}, completed.err
	}
	emit(onEvent, "tool.completed", *run, map[string]any{"step_index": stepIndex, "tool_call_id": call.ID, "tool_name": call.Name, "output": completed.output})
	return Message{Role: "tool", Name: tool.ID, ToolCallID: call.ID, Content: stringify(completed.output)}, nil
}

func (a *Agent) Continue(ctx context.Context, options ContinueOptions) (result RunResult, err error) {
	started := time.Now()
	if options.RunID != "" && options.State != nil {
		loaded, loadErr := options.State.Load(ctx, options.RunID)
		if loadErr != nil {
			return RunResult{}, loadErr
		}
		if loaded == nil {
			return RunResult{}, fmt.Errorf("run %s not found", options.RunID)
		}
		options.Run = *loaded
	}
	run := options.Run.Run
	if run.AgentID != a.definition.ID {
		return RunResult{}, fmt.Errorf("run %s belongs to agent %s", run.ID, run.AgentID)
	}
	if run.Status == "waiting_for_human" && strings.TrimSpace(options.HumanInput) == "" && (run.Pause == nil || len(run.Pause.PendingToolCalls) == 0) {
		return RunResult{}, fmt.Errorf("run %s is waiting for human input", run.ID)
	}
	previousStatus := run.Status
	if options.HumanInput != "" {
		run.Messages = append(run.Messages, Message{Role: "user", Content: options.HumanInput})
		run.Pause = nil
	} else if run.Pause != nil && len(run.Pause.PendingToolCalls) > 0 {
		contextMu := &sync.Mutex{}
		approved, rejected, outputs := map[string]ToolDecision{}, map[string]ToolDecision{}, map[string]any{}
		for _, item := range options.Approvals {
			approved[item.ToolCallID] = item
		}
		for _, item := range options.Rejections {
			rejected[item.ToolCallID] = item
		}
		for _, item := range options.ToolOutputs {
			outputs[item.ToolCallID] = item.Output
		}
		tools := map[string]Tool{}
		for _, item := range a.definition.Tools {
			tools[item.ID] = item
		}
		for _, pending := range run.Pause.PendingToolCalls {
			current := tools[pending.Call.Name]
			if decision, ok := rejected[pending.Call.ID]; ok {
				run.Messages = append(run.Messages, Message{Role: "tool", Name: current.ID, ToolCallID: pending.Call.ID, Content: stringify(map[string]any{"error": firstNonEmpty(decision.Reason, "Tool call rejected")}), IsError: true})
				continue
			}
			if pending.Kind == "approval" {
				if _, ok := approved[pending.Call.ID]; !ok {
					return RunResult{}, fmt.Errorf("missing approval decision for tool call %s", pending.Call.ID)
				}
				message, executeErr := executeTool(ctx, current, pending.Call, &run, run.StepCount-1, options.OnEvent, contextMu)
				if executeErr != nil {
					return RunResult{}, executeErr
				}
				run.Messages = append(run.Messages, message)
				if current.NextTurn != nil {
					copy := *current.NextTurn
					run.NextTurn = &copy
				}
			} else {
				value, ok := outputs[pending.Call.ID]
				if !ok {
					return RunResult{}, fmt.Errorf("missing output for tool call %s", pending.Call.ID)
				}
				var executeErr error
				if current.OnResponseReceived != nil {
					contextMu.Lock()
					contextValue := run.Context
					contextMu.Unlock()
					value, executeErr = current.OnResponseReceived(value, RuntimeContext{RunID: run.ID, AgentID: run.AgentID, StepIndex: run.StepCount - 1, Context: contextValue, ToolCall: pending.Call, SetContext: func(value any) { contextMu.Lock(); run.Context = value; contextMu.Unlock() }})
					if executeErr != nil {
						return RunResult{}, executeErr
					}
				}
				value, executeErr = validate(current.OutputSchema, value, "tool output")
				if executeErr != nil {
					return RunResult{}, executeErr
				}
				run.Messages = append(run.Messages, Message{Role: "tool", Name: current.ID, ToolCallID: pending.Call.ID, Content: stringify(value)})
				if current.NextTurn != nil {
					copy := *current.NextTurn
					run.NextTurn = &copy
				}
			}
		}
		run.Pause = nil
	}
	run.Status = "running"
	run.UpdatedAt = nowISO()
	emit(options.OnEvent, "run.resumed", run, map[string]any{"previous_status": previousStatus})
	defer func() {
		captureDevtools(a.definition, func() *RunResult {
			if err == nil {
				return &result
			}
			return nil
		}(), "agent.continue", started, options.Devtools, run.ID, err)
	}()
	contextValue := options.Context
	if contextValue == nil {
		contextValue = run.Context
	}
	result, err = a.execute(ctx, run, append([]RunStep(nil), options.Run.Steps...), options.Client, contextValue, options.Model, options.Preset, options.MaxSteps, options.ModelRetry, options.ToolExecution, options.OnEvent)
	if options.State != nil && (err == nil || result.Run.ID != "") {
		_ = options.State.Save(ctx, result)
	}
	return result, err
}

func (a *Agent) ContinueStream(ctx context.Context, options ContinueOptions) *StreamResult {
	streamCtx, cancel := context.WithCancel(ctx)
	stream := newStreamResult(cancel)
	original := options.OnEvent
	options.OnEvent = func(event AgentEvent) {
		stream.push(event)
		if original != nil {
			original(event)
		}
	}
	if client, ok := options.Client.(StreamingModelClient); ok {
		options.Client = streamClientAdapter{client: client, handler: options.OnEvent}
	}
	go func() { result, err := a.Continue(streamCtx, options); stream.finish(result, err) }()
	return stream
}

func (a *Agent) execute(ctx context.Context, run RunRecord, steps []RunStep, client ModelClient, contextValue any, model, preset string, requestedMaxSteps int, retryOverride *ModelRetryConfig, executionOverride *ToolExecutionConfig, onEvent EventHandler) (RunResult, error) {
	maxSteps := requestedMaxSteps
	if maxSteps <= 0 {
		maxSteps = a.definition.MaxSteps
	}
	if maxSteps <= 0 {
		maxSteps = 12
	}
	retry := a.definition.ModelRetry
	if retryOverride != nil {
		retry = *retryOverride
	}
	if retry.Backoff <= 0 {
		retry.Backoff = 250 * time.Millisecond
	}
	execution := a.definition.ToolExecution
	if executionOverride != nil {
		execution = *executionOverride
	}
	if execution.Concurrency <= 0 {
		execution.Concurrency = 1
	}
	toolsByID := make(map[string]Tool, len(a.definition.Tools))
	for _, tool := range a.definition.Tools {
		toolsByID[tool.ID] = tool
	}
	run.Status = "running"
	targetModel := firstNonEmpty(model, toPresetAlias(preset), a.definition.Model, toPresetAlias(a.definition.Preset))
	next := run.NextTurn
	loopStarted := time.Now()
	run.NextTurn = nil

	for stepIndex := run.StepCount; stepIndex < maxSteps; stepIndex++ {
		turn := TurnContext{NumberOfTurns: stepIndex + 1, StepIndex: stepIndex, Messages: append([]Message(nil), run.Messages...), Context: run.Context}
		turnModel, turnInstructions := targetModel, a.definition.Instructions
		var temperature, topP *float64
		var maxOutput *int
		turnTools := a.definition.Tools
		if a.definition.DynamicModel != nil {
			turnModel = a.definition.DynamicModel(turn)
		}
		if a.definition.DynamicInstructions != nil {
			turnInstructions = a.definition.DynamicInstructions(turn)
		}
		if a.definition.Temperature != nil {
			temperature = a.definition.Temperature(turn)
		}
		if a.definition.MaxOutputTokens != nil {
			maxOutput = a.definition.MaxOutputTokens(turn)
		}
		if a.definition.TopP != nil {
			topP = a.definition.TopP(turn)
		}
		if a.definition.DynamicTools != nil {
			turnTools = a.definition.DynamicTools(turn)
		}
		if next != nil {
			if next.Model != "" {
				turnModel = next.Model
			}
			if next.Instructions != "" {
				turnInstructions = next.Instructions
			}
			if next.Temperature != nil {
				temperature = next.Temperature
			}
			if next.MaxOutputTokens != nil {
				maxOutput = next.MaxOutputTokens
			}
			if next.TopP != nil {
				topP = next.TopP
			}
			if next.Tools != nil {
				turnTools = next.Tools
			}
			next = nil
		}
		toolsByID = make(map[string]Tool, len(turnTools))
		for _, tool := range turnTools {
			toolsByID[tool.ID] = tool
		}
		step := RunStep{Index: stepIndex, Status: "executing_model"}
		steps = append(steps, step)
		emit(onEvent, "step.started", run, map[string]any{"step_index": stepIndex})
		var response ModelResponse
		var err error
		for attempt := 0; attempt <= retry.MaxRetries; attempt++ {
			steps[len(steps)-1].ModelAttempts = attempt + 1
			emit(onEvent, "model.requested", run, map[string]any{"step_index": stepIndex, "attempt": attempt + 1, "model": turnModel})
			response, err = client.Generate(ctx, ModelRequest{
				AgentID:      a.definition.ID,
				Model:        turnModel,
				Instructions: turnInstructions,
				Messages:     run.Messages,
				Tools:        turnTools,
				Context:      run.Context,
				Temperature:  temperature, MaxOutputTokens: maxOutput, TopP: topP,
			})
			if err == nil {
				break
			}
			if attempt < retry.MaxRetries {
				select {
				case <-ctx.Done():
					return RunResult{}, ctx.Err()
				case <-time.After(retry.Backoff * time.Duration(attempt+1)):
				}
			}
		}
		if err != nil {
			run.Status = "failed"
			run.Error = err.Error()
			steps[len(steps)-1].Status = "failed"
			steps[len(steps)-1].Error = err.Error()
			emit(onEvent, "run.failed", run, map[string]any{"error": err.Error()})
			return RunResult{}, err
		}
		run.Messages = append(run.Messages, response.Message)
		run.StepCount = stepIndex + 1
		run.UpdatedAt = nowISO()
		step = steps[len(steps)-1]
		step.ToolCalls = response.Message.ToolCalls
		step.RequestID = response.RequestID
		step.NativeResponseID = response.NativeResponseID
		step.Provider = response.Provider
		step.Model = firstNonEmpty(response.Model, turnModel)
		step.Usage = response.Usage
		step.ResponseMeta = response.ResponseMeta
		step.FinishReason = response.FinishReason
		step.Warnings = response.Warnings
		steps[len(steps)-1] = step
		usage := normalizedUsage(response)
		run.Usage.InputTokens += usage.InputTokens
		run.Usage.OutputTokens += usage.OutputTokens
		run.Usage.CachedTokens += usage.CachedTokens
		run.Usage.TotalTokens += usage.TotalTokens
		run.Usage.Cost += usage.Cost
		emit(onEvent, "model.completed", run, map[string]any{"step_index": stepIndex, "attempt": step.ModelAttempts, "request_id": step.RequestID, "model": step.Model})
		var parsed any
		if len(response.Message.ToolCalls) == 0 && a.definition.ParseOutput != nil {
			parsed, err = a.definition.ParseOutput(response.Message.Content)
			if err != nil {
				return RunResult{}, err
			}
		}
		if a.definition.HumanReview != nil {
			review := a.definition.HumanReview(HumanReviewContext{RunID: run.ID, AgentID: run.AgentID, StepIndex: stepIndex, Input: run.Input, Context: contextValue, Messages: append([]Message(nil), run.Messages...), Response: response, ParsedOutput: parsed})
			if review != nil {
				run.Status = "waiting_for_human"
				run.Pause = &HumanPause{Reason: review.Reason, Payload: review.Payload, RequestedAt: nowISO()}
				steps[len(steps)-1].Status = "checkpointed"
				emit(onEvent, "checkpoint.saved", run, map[string]any{"step_index": stepIndex})
				emit(onEvent, "run.waiting_for_human", run, map[string]any{"step_index": stepIndex, "pause": run.Pause})
				return RunResult{Run: run, Steps: steps, Messages: run.Messages}, nil
			}
		}

		if len(response.Message.ToolCalls) == 0 {
			var output any = response.Message.Content
			if a.definition.ParseOutput != nil {
				output = parsed
			}
			output, err = validate(a.definition.OutputSchema, output, "agent output")
			if err != nil {
				return RunResult{}, err
			}
			for _, condition := range a.definition.StopWhen {
				if reason, stopped := condition(StopState{StepCount: run.StepCount, Usage: run.Usage, ToolCalls: response.Message.ToolCalls, FinishReason: response.FinishReason, Elapsed: time.Since(loopStarted)}); stopped {
					run.Status = "stopped"
					run.StopReason = reason
					run.Result = output
					return RunResult{Run: run, Steps: steps, Output: output, Messages: run.Messages, Usage: run.Usage}, nil
				}
			}
			run.Status = "completed"
			run.Result = output
			steps[len(steps)-1].Status = "checkpointed"
			emit(onEvent, "checkpoint.saved", run, map[string]any{"step_index": stepIndex})
			emit(onEvent, "run.completed", run, map[string]any{"output": output})
			return RunResult{Run: run, Steps: steps, Output: output, Messages: run.Messages, Usage: run.Usage}, nil
		}

		automatic := make([]ToolCall, 0, len(response.Message.ToolCalls))
		pending := make([]PendingToolCall, 0)
		for _, call := range response.Message.ToolCalls {
			tool, ok := toolsByID[call.Name]
			if !ok {
				return RunResult{}, fmt.Errorf("unknown tool %q", call.Name)
			}
			checked, validateErr := validate(tool.InputSchema, call.Input, "tool input")
			if validateErr != nil {
				return RunResult{}, validateErr
			}
			call.Input = checked
			runtime := RuntimeContext{RunID: run.ID, AgentID: run.AgentID, StepIndex: stepIndex, Context: run.Context, ToolCall: call}
			if tool.OnToolCalled != nil {
				value, completed, callErr := tool.OnToolCalled(call.Input, runtime)
				if callErr != nil {
					return RunResult{}, callErr
				}
				if !completed {
					pending = append(pending, PendingToolCall{call, "hitl", "Tool requires human input"})
					continue
				}
				tool.Execute = func(any, RuntimeContext) (any, error) { return value, nil }
				toolsByID[call.Name] = tool
				automatic = append(automatic, call)
				continue
			}
			requires := tool.RequireApproval
			if tool.Approval != nil {
				requires, err = tool.Approval(call.Input, runtime)
				if err != nil {
					return RunResult{}, err
				}
			}
			if a.definition.RequireApproval != nil {
				requires, err = a.definition.RequireApproval(call, runtime)
				if err != nil {
					return RunResult{}, err
				}
			}
			if requires {
				pending = append(pending, PendingToolCall{call, "approval", "Tool requires approval"})
				continue
			}
			if tool.Execute == nil {
				pending = append(pending, PendingToolCall{call, "manual", "Tool requires external output"})
				continue
			}
			automatic = append(automatic, call)
		}
		run.Status = "waiting_for_tools"
		steps[len(steps)-1].Status = "executing_tools"
		toolMessages := make([]Message, len(automatic))
		contextUpdates := make([]any, len(automatic))
		contextWasSet := make([]bool, len(automatic))
		sem := make(chan struct{}, execution.Concurrency)
		var wg sync.WaitGroup
		var firstErr error
		var errMu sync.Mutex
		for index, toolCall := range automatic {
			initialContext := run.Context
			wg.Add(1)
			go func(index int, toolCall ToolCall, initialContext any) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				tool, ok := toolsByID[toolCall.Name]
				if !ok {
					errMu.Lock()
					if firstErr == nil {
						firstErr = fmt.Errorf("unknown tool %q", toolCall.Name)
					}
					errMu.Unlock()
					return
				}
				emit(onEvent, "tool.started", run, map[string]any{"step_index": stepIndex, "tool_call_id": toolCall.ID, "tool_name": toolCall.Name})
				toolCtx := ctx
				cancel := func() {}
				if tool.Timeout > 0 {
					toolCtx, cancel = context.WithTimeout(ctx, tool.Timeout)
				}
				defer cancel()
				type toolResult struct {
					output any
					err    error
				}
				resultCh := make(chan toolResult, 1)
				go func() {
					progress := func(value any) error {
						checked, validateErr := validate(tool.EventSchema, value, "tool progress event")
						if validateErr != nil {
							return validateErr
						}
						emit(onEvent, "tool.preliminary_result", run, map[string]any{"step_index": stepIndex, "tool_call_id": toolCall.ID, "tool_name": toolCall.Name, "result": checked})
						return nil
					}
					currentContext := initialContext
					output, executeErr := tool.Execute(toolCall.Input, RuntimeContext{
						RunID:        run.ID,
						AgentID:      a.definition.ID,
						StepIndex:    stepIndex,
						Context:      currentContext,
						ToolCall:     toolCall,
						EmitProgress: progress,
						SetContext: func(value any) {
							currentContext = value
							contextUpdates[index] = value
							contextWasSet[index] = true
						},
					})
					if executeErr == nil {
						output, executeErr = validate(tool.OutputSchema, output, "tool output")
					}
					resultCh <- toolResult{output, executeErr}
				}()
				var tr toolResult
				select {
				case tr = <-resultCh:
				case <-toolCtx.Done():
					tr.err = fmt.Errorf("tool %s timed out: %w", toolCall.Name, toolCtx.Err())
				}
				if tr.err != nil && tool.OnError == "return-to-model" {
					toolMessages[index] = Message{Role: "tool", Name: tool.ID, ToolCallID: toolCall.ID, Content: stringify(map[string]any{"error": tr.err.Error()}), IsError: true}
					emit(onEvent, "tool.failed", run, map[string]any{"tool_call_id": toolCall.ID, "tool_name": toolCall.Name, "error": tr.err.Error()})
					return
				}
				if tr.err != nil {
					errMu.Lock()
					if firstErr == nil {
						firstErr = tr.err
					}
					errMu.Unlock()
					emit(onEvent, "tool.failed", run, map[string]any{"tool_call_id": toolCall.ID, "tool_name": toolCall.Name, "error": tr.err.Error()})
					return
				}
				toolMessages[index] = Message{
					Role:       "tool",
					Name:       tool.ID,
					ToolCallID: toolCall.ID,
					Content:    stringify(tr.output),
				}
				emit(onEvent, "tool.completed", run, map[string]any{"tool_call_id": toolCall.ID, "tool_name": toolCall.Name, "output": tr.output})
			}(index, toolCall, initialContext)
		}
		wg.Wait()
		if firstErr != nil {
			return RunResult{}, firstErr
		}
		for index := range contextUpdates {
			if contextWasSet[index] {
				run.Context = contextUpdates[index]
			}
		}
		run.Messages = append(run.Messages, toolMessages...)
		for _, call := range automatic {
			if tool := toolsByID[call.Name]; tool.NextTurn != nil {
				copy := *tool.NextTurn
				next = &copy
			}
		}
		if len(pending) > 0 {
			run.NextTurn = next
			run.Status = "waiting_for_human"
			run.Pause = &HumanPause{Reason: "Pending tool calls require input", RequestedAt: nowISO(), Kind: "tool_approval", PendingToolCalls: pending}
			steps[len(steps)-1].Status = "checkpointed"
			emit(onEvent, "run.waiting_for_human", run, map[string]any{"step_index": stepIndex, "pause": run.Pause})
			return RunResult{Run: run, Steps: steps, Messages: run.Messages, Usage: run.Usage}, nil
		}
		for _, condition := range a.definition.StopWhen {
			if reason, stopped := condition(StopState{StepCount: run.StepCount, Usage: run.Usage, ToolCalls: response.Message.ToolCalls, FinishReason: response.FinishReason, Elapsed: time.Since(loopStarted)}); stopped {
				run.Status = "stopped"
				run.StopReason = reason
				run.Result = response.Message.Content
				return RunResult{Run: run, Steps: steps, Output: run.Result, Messages: run.Messages, Usage: run.Usage}, nil
			}
		}
		steps[len(steps)-1].Status = "checkpointed"
		emit(onEvent, "checkpoint.saved", run, map[string]any{"step_index": stepIndex})
	}

	run.Status = "failed"
	run.Error = fmt.Sprintf("Max steps exceeded (%d)", maxSteps)
	emit(onEvent, "run.failed", run, map[string]any{"error": run.Error})
	return RunResult{}, errors.New(run.Error)
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

func boolPtr(value bool) *bool { return &value }

func stringPointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
