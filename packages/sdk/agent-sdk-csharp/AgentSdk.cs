using System.Text.Json;
using PhaseoSdk;

namespace PhaseoAgentSdk;

public sealed record ToolCall(string Id, string Name, object? Input);

public sealed record Message(
    string Role,
    string Content,
    IReadOnlyList<ToolCall>? ToolCalls = null,
    string? ToolCallId = null,
    string? Name = null,
    bool IsError = false
);

public sealed record Tool
{
    public string Id { get; init; } = string.Empty;
    public Func<object?, RuntimeContext, Task<object?>>? Execute { get; init; }
    public string? Description { get; init; }
    public Dictionary<string, object?>? Parameters { get; init; }
    public TimeSpan? Timeout { get; init; }
    public Func<object?, object?>? InputSchema { get; init; }
    public Func<object?, object?>? OutputSchema { get; init; }
    public Func<object?, object?>? EventSchema { get; init; }
    public bool RequireApproval { get; init; }
    public Func<object?, RuntimeContext, Task<bool>>? Approval { get; init; }
    public Func<object?, RuntimeContext, Task<(bool Completed, object? Output)>>? OnToolCalled { get; init; }
    public Func<object?, RuntimeContext, Task<object?>>? OnResponseReceived { get; init; }
    public NextTurnParams? NextTurnParams { get; init; }
    public string OnError { get; init; } = "fail-run";

    public Tool(string Id, Func<object?, RuntimeContext, Task<object?>>? Execute = null, string? Description = null, Dictionary<string, object?>? Parameters = null, TimeSpan? Timeout = null)
        => (this.Id, this.Execute, this.Description, this.Parameters, this.Timeout) = (Id, Execute, Description, Parameters, Timeout);
}

public sealed record NextTurnParams(string? Model = null, string? Instructions = null, double? Temperature = null, int? MaxOutputTokens = null, double? TopP = null, IReadOnlyList<Tool>? Tools = null);
public sealed record TurnContext(int NumberOfTurns, int StepIndex, IReadOnlyList<Message> Messages, object? Context, ToolCall? LastToolCall = null);

public sealed record RuntimeContext(string RunId, string AgentId, int StepIndex, object? Context = null, CancellationToken CancellationToken = default, ToolCall? ToolCall = null, Func<object?, Task>? EmitProgress = null, Action<object?>? SetContext = null);

public sealed record ModelRequest(
    string AgentId,
    IReadOnlyList<Message> Messages,
    IReadOnlyList<Tool> Tools,
    string? Model = null,
    string? Instructions = null,
    object? Context = null,
    CancellationToken CancellationToken = default,
    double? Temperature = null,
    int? MaxOutputTokens = null,
    double? TopP = null,
    bool Stream = false
);

public sealed record ModelResponse(
    Message Message,
    Dictionary<string, object?>? Usage = null,
    string? RequestId = null,
    string? NativeResponseId = null,
    string? Provider = null,
    string? Model = null,
    Dictionary<string, object?>? ResponseMeta = null,
    string? FinishReason = null,
    double Cost = 0,
    IReadOnlyList<Dictionary<string, string>>? Warnings = null
);

public interface IModelClient
{
    Task<ModelResponse> Generate(ModelRequest request);
}

public sealed record AgentDefinition
{
    public required string Id { get; init; }
    public string? Model { get; init; }
    public string? Preset { get; init; }
    public string? Instructions { get; init; }
    public IReadOnlyList<Tool> Tools { get; init; } = Array.Empty<Tool>();
    public int MaxSteps { get; init; } = 12;
    public Func<string, object?>? ParseOutput { get; init; }
    public Func<HumanReviewContext, Task<HumanReviewRequest?>>? HumanReview { get; init; }
    public ModelRetryConfig ModelRetry { get; init; } = new();
    public ToolExecutionConfig ToolExecution { get; init; } = new();
    public IReadOnlyList<Func<StopState, (bool Stop, string Reason)>> StopWhen { get; init; } = Array.Empty<Func<StopState, (bool, string)>>();
    public Func<ToolCall, RuntimeContext, Task<bool>>? RequireApproval { get; init; }
    public Func<object?, object?>? OutputSchema { get; init; }
    public Func<TurnContext, string?>? DynamicModel { get; init; }
    public Func<TurnContext, string?>? DynamicInstructions { get; init; }
    public Func<TurnContext, double?>? Temperature { get; init; }
    public Func<TurnContext, int?>? MaxOutputTokens { get; init; }
    public Func<TurnContext, double?>? TopP { get; init; }
    public Func<TurnContext, IReadOnlyList<Tool>>? DynamicTools { get; init; }
}
public sealed record ModelStreamEvent(string Type, string? Delta = null, object? Item = null, ModelResponse? Response = null);
public interface IStreamingModelClient : IModelClient { IAsyncEnumerable<ModelStreamEvent> Stream(ModelRequest request); }

public sealed class AgentStreamResult
{
    private readonly List<AgentEvent> _events = [];
    private readonly object _gate = new();
    private TaskCompletionSource<bool> _changed = new(TaskCreationOptions.RunContinuationsAsynchronously);
    internal Task<RunResult> Completion { get; set; } = null!;
	internal CancellationTokenSource Cancellation { get; set; } = null!;
	public void Cancel() => Cancellation.Cancel();
    internal void Publish(AgentEvent value) { lock (_gate) { _events.Add(value); _changed.TrySetResult(true); _changed = new(TaskCreationOptions.RunContinuationsAsynchronously); } }
    public Task<RunResult> GetResult() => Completion;
    public async IAsyncEnumerable<AgentEvent> FullStream()
    {
        var index = 0;
        while (true) { AgentEvent? value = null; Task changed; lock (_gate) { if (index < _events.Count) value = _events[index++]; changed = _changed.Task; } if (value is not null) { yield return value; continue; } if (Completion.IsCompleted) yield break; await changed.ConfigureAwait(false); }
    }
    public async IAsyncEnumerable<string> TextStream() { await foreach (var item in FullStream()) if (item.Type == "response.output_text.delta" && item.Details?["delta"] is string delta) yield return delta; }
}

public sealed record ModelRetryConfig(int MaxRetries = 0, TimeSpan? Backoff = null);
public sealed record ToolExecutionConfig(int Concurrency = 1);
public sealed record HumanReviewRequest(string Reason, object? Payload = null);
public sealed record PendingToolCall(ToolCall Call, string Kind, string? Reason = null);
public sealed record ToolDecision(string ToolCallId, string? Reason = null);
public sealed record ToolOutput(string ToolCallId, object? Output);
public sealed record UsageSummary(int InputTokens = 0, int OutputTokens = 0, int CachedTokens = 0, int TotalTokens = 0, double Cost = 0);
public sealed record StopState(int StepCount, UsageSummary Usage, IReadOnlyList<ToolCall> ToolCalls, string? FinishReason, TimeSpan Elapsed);
public interface IStateAccessor { Task<RunResult?> Load(string runId, CancellationToken cancellationToken = default); Task Save(RunResult result, CancellationToken cancellationToken = default); }
public sealed record HumanPause(string Reason, object? Payload, string RequestedAt, string Kind = "human_review", IReadOnlyList<PendingToolCall>? PendingToolCalls = null);
public sealed record HumanReviewContext(string RunId, string AgentId, int StepIndex, object? Input, object? Context, IReadOnlyList<Message> Messages, ModelResponse Response, object? ParsedOutput);
public sealed record AgentEvent(string Type, string RunId, string AgentId, string Timestamp, string Status, Dictionary<string, object?>? Details = null);
public sealed record AgentDevtoolsConfig(bool Enabled = true, string Directory = ".phaseo-devtools");

public sealed record RunStep
{
    public required int Index { get; init; }
    public string Status { get; init; } = "pending";
    public IReadOnlyList<ToolCall> ToolCalls { get; init; } = Array.Empty<ToolCall>();
    public string? RequestId { get; init; }
    public string? NativeResponseId { get; init; }
    public string? Provider { get; init; }
    public string? Model { get; init; }
    public int ModelAttempts { get; init; }
    public Dictionary<string, object?>? Usage { get; init; }
    public Dictionary<string, object?>? ResponseMeta { get; init; }
    public string? Error { get; init; }
    public string? FinishReason { get; init; }
    public IReadOnlyList<Dictionary<string,string>> Warnings { get; init; } = Array.Empty<Dictionary<string,string>>();
}

public sealed record RunRecord
{
    public required string Id { get; init; }
    public required string AgentId { get; init; }
    public required string Status { get; init; }
    public object? Input { get; init; }
    public object? Context { get; init; }
    public IReadOnlyList<Message> Messages { get; init; } = Array.Empty<Message>();
    public int StepCount { get; init; }
    public object? Result { get; init; }
    public string? Error { get; init; }
    public HumanPause? Pause { get; init; }
    public string CreatedAt { get; init; } = string.Empty;
    public string UpdatedAt { get; init; } = string.Empty;
    public string? StopReason { get; init; }
    public UsageSummary Usage { get; init; } = new();
    public NextTurnParams? NextTurn { get; init; }
}

public sealed record RunResult
{
    public required RunRecord Run { get; init; }
    public IReadOnlyList<RunStep> Steps { get; init; } = Array.Empty<RunStep>();
    public object? Output { get; init; }
    public IReadOnlyList<Message> Messages { get; init; } = Array.Empty<Message>();
    public UsageSummary Usage { get; init; } = new();
}

public sealed record RunOptions
{
    public required object? Input { get; init; }
    public required IModelClient Client { get; init; }
    public object? Context { get; init; }
    public string? Model { get; init; }
    public int? MaxSteps { get; init; }
    public string? Preset { get; init; }
    public ModelRetryConfig? ModelRetry { get; init; }
    public ToolExecutionConfig? ToolExecution { get; init; }
    public CancellationToken CancellationToken { get; init; }
    public Action<AgentEvent>? OnEvent { get; init; }
    public AgentDevtoolsConfig? Devtools { get; init; }
    public IStateAccessor? State { get; init; }
}

public sealed record ContinueOptions
{
    public RunResult? Run { get; init; }
    public string? RunId { get; init; }
    public required IModelClient Client { get; init; }
    public object? Context { get; init; }
    public string? Model { get; init; }
    public string? Preset { get; init; }
    public int? MaxSteps { get; init; }
    public string? HumanInput { get; init; }
    public ModelRetryConfig? ModelRetry { get; init; }
    public ToolExecutionConfig? ToolExecution { get; init; }
    public CancellationToken CancellationToken { get; init; }
    public Action<AgentEvent>? OnEvent { get; init; }
    public AgentDevtoolsConfig? Devtools { get; init; }
    public IReadOnlyList<ToolDecision> Approvals { get; init; } = Array.Empty<ToolDecision>();
    public IReadOnlyList<ToolDecision> Rejections { get; init; } = Array.Empty<ToolDecision>();
    public IReadOnlyList<ToolOutput> ToolOutputs { get; init; } = Array.Empty<ToolOutput>();
    public IStateAccessor? State { get; init; }
}

public sealed record GatewayAgentClientOptions
{
    public PhaseoSdk.Phaseo? Client { get; init; }
    public Dictionary<string, object?>? ClientOptions { get; init; }
    public string? Model { get; init; }
    public string? Preset { get; init; }
    public Dictionary<string, object?>? Provider { get; init; }
    public Dictionary<string, object?>? Reasoning { get; init; }
    public double? Temperature { get; init; }
    public int? MaxOutputTokens { get; init; }
    public bool? ParallelToolCalls { get; init; }
    public Dictionary<string, string>? Metadata { get; init; }
    public string? User { get; init; }
    public bool? IncludeMeta { get; init; }
    public List<Dictionary<string, object?>>? GatewayTools { get; init; }
    public object? ToolChoice { get; init; }
    public Dictionary<string, object?>? ProviderOptions { get; init; }
    public string? PromptCacheKey { get; init; }
    public Dictionary<string, object?>? RequestOptions { get; init; }
}

public sealed class GatewayAgentClient : IStreamingModelClient
{
    private readonly PhaseoSdk.Phaseo _client;
    private readonly GatewayAgentClientOptions _options;

    internal GatewayAgentClient(PhaseoSdk.Phaseo client, GatewayAgentClientOptions options)
    {
        _client = client;
        _options = options;
    }

    public async Task<ModelResponse> Generate(ModelRequest request)
    {
        var model = FirstNonEmpty(
            request.Model,
            _options.Model,
            ToPresetAlias(_options.Preset),
            "phaseo/free");

        var tools = new List<object?>();
        foreach (var tool in request.Tools)
        {
            tools.Add(new Dictionary<string, object?>
            {
                ["type"] = "function",
                ["function"] = new Dictionary<string, object?>
                {
                    ["name"] = tool.Id,
                    ["description"] = tool.Description,
                    ["parameters"] = tool.Parameters ?? new Dictionary<string, object?>
                    {
                        ["type"] = "object",
                        ["additionalProperties"] = true,
                    },
                },
            });
        }
        if (_options.GatewayTools is not null)
        {
            tools.AddRange(_options.GatewayTools);
        }

        Dictionary<string, object>? metadata = null;
        if (_options.Metadata is not null)
        {
            metadata = _options.Metadata.ToDictionary(
                pair => pair.Key,
                pair => (object) pair.Value);
        }

        var payload = new Dictionary<string, object?>(_options.RequestOptions ?? new Dictionary<string, object?>())
        {
            ["model"] = model,
            ["input"] = ToResponsesInput(request.Messages),
            ["instructions"] = ToInstructions(request.Messages, request.Instructions),
            ["tools"] = tools,
            ["tool_choice"] = _options.ToolChoice,
            ["parallel_tool_calls"] = _options.ParallelToolCalls,
            ["temperature"] = request.Temperature ?? _options.Temperature,
            ["max_output_tokens"] = request.MaxOutputTokens ?? _options.MaxOutputTokens,
            ["top_p"] = request.TopP,
            ["provider"] = _options.Provider,
            ["reasoning"] = _options.Reasoning,
            ["metadata"] = metadata,
            ["meta"] = _options.IncludeMeta,
            ["user"] = _options.User,
            ["provider_options"] = _options.ProviderOptions,
            ["prompt_cache_key"] = _options.PromptCacheKey,
        }
        .Where(pair => pair.Value is not null)
        .ToDictionary(pair => pair.Key, pair => pair.Value);

        var rawResponse = await _client.CreateResponse(payload!).ConfigureAwait(false);
        var response = rawResponse?.ToDictionary(pair => pair.Key, pair => (object?)pair.Value)
            ?? new Dictionary<string, object?>();

        return new ModelResponse(
            Message: new Message(
                Role: "assistant",
                Content: ExtractAssistantText(response),
                ToolCalls: ExtractToolCalls(response)
            ),
            Usage: TryGetDictionary(response, "usage"),
            RequestId: TryGetString(response, "id"),
            NativeResponseId: TryGetString(response, "native_response_id"),
            Provider: TryGetString(response, "provider"),
            Model: TryGetString(response, "model"),
            ResponseMeta: TryGetDictionary(response, "meta"),
            FinishReason: TryGetString(response, "finish_reason") ?? TryGetString(response, "stop_reason") ?? TryGetString(response, "status"),
            Cost: TryGetCost(response),
            Warnings: TryGetWarnings(response)
        );
    }

	public async IAsyncEnumerable<ModelStreamEvent> Stream(ModelRequest request)
	{
		var tools = request.Tools.Select(tool => (object?)new Dictionary<string, object?> { ["type"]="function", ["function"]=new Dictionary<string,object?> { ["name"]=tool.Id,["description"]=tool.Description,["parameters"]=tool.Parameters??new Dictionary<string,object?>{{"type","object"},{"additionalProperties",true}} } }).ToList();
		if (_options.GatewayTools is not null) tools.AddRange(_options.GatewayTools);
		var payload = new Dictionary<string, object?>(_options.RequestOptions ?? new()) {
			["model"] = FirstNonEmpty(request.Model,_options.Model,ToPresetAlias(_options.Preset),"phaseo/free"), ["input"] = ToResponsesInput(request.Messages), ["instructions"] = ToInstructions(request.Messages,request.Instructions), ["tools"] = tools,
			["tool_choice"]=_options.ToolChoice,["parallel_tool_calls"]=_options.ParallelToolCalls,["temperature"]=request.Temperature??_options.Temperature,["max_output_tokens"]=request.MaxOutputTokens??_options.MaxOutputTokens,["top_p"]=request.TopP,["provider"]=_options.Provider,["reasoning"]=_options.Reasoning,["metadata"]=_options.Metadata,["meta"]=_options.IncludeMeta,["user"]=_options.User,["provider_options"]=_options.ProviderOptions,["prompt_cache_key"]=_options.PromptCacheKey,["stream"]=true
		}.Where(pair=>pair.Value is not null).ToDictionary(pair=>pair.Key,pair=>pair.Value);
		await foreach (var line in _client.StreamResponse(payload!.ToDictionary(pair=>pair.Key,pair=>pair.Value!),request.CancellationToken).WithCancellation(request.CancellationToken).ConfigureAwait(false))
		{
			if (!line.StartsWith("data:",StringComparison.OrdinalIgnoreCase)) continue;
			var data=line[5..].Trim(); if (data.Length==0||data=="[DONE]") continue;
			Dictionary<string,object?>? raw; try { raw=JsonSerializer.Deserialize<Dictionary<string,object?>>(data); } catch(JsonException) { continue; }
			if(raw is null) continue; var type=TryGetString(raw,"type")??string.Empty; var delta=TryGetString(raw,"delta")??TryGetString(raw,"text");
			if(type.Contains("reasoning",StringComparison.OrdinalIgnoreCase)&&delta is not null) yield return new ModelStreamEvent("response.reasoning.delta",delta);
			else if(delta is not null&&(type.Contains("output_text.delta",StringComparison.OrdinalIgnoreCase)||type.Length==0)) yield return new ModelStreamEvent("response.output_text.delta",delta);
			if(raw.TryGetValue("item",out var item)&&item is not null) yield return new ModelStreamEvent("response.item",Item:item);
			if(type=="response.completed") { var response=TryGetDictionary(raw,"response")??raw; yield return new ModelStreamEvent("response.completed",Response:ToModelResponse(response)); yield break; }
		}
	}

	private static ModelResponse ToModelResponse(Dictionary<string,object?> response) => new(
		new Message("assistant",ExtractAssistantText(response),ExtractToolCalls(response)),TryGetDictionary(response,"usage"),TryGetString(response,"request_id")??TryGetString(response,"id"),TryGetString(response,"native_response_id")??TryGetString(response,"nativeResponseId"),TryGetString(response,"provider"),TryGetString(response,"model"),TryGetDictionary(response,"meta"),TryGetString(response,"finish_reason")??TryGetString(response,"stop_reason")??TryGetString(response,"status"),TryGetCost(response),TryGetWarnings(response));

	private static double TryGetCost(Dictionary<string,object?> response)
	{
		static double Number(object? value) => value switch { JsonElement json when json.ValueKind==JsonValueKind.Number&&json.TryGetDouble(out var number)=>number, IConvertible convertible=>Convert.ToDouble(convertible), _=>0 };
		var usage=TryGetDictionary(response,"usage"); var meta=TryGetDictionary(response,"meta");
		foreach(var pair in new[]{(response,"cost"),(response,"cost_usd"),(usage,"cost"),(meta,"cost"),(meta,"cost_usd")}) if(pair.Item1?.TryGetValue(pair.Item2,out var value)==true&&Number(value)!=0) return Number(value);
		if(response.TryGetValue("cost_nanos",out var directNanos)) return Number(directNanos)/1_000_000_000d;if(meta?.TryGetValue("cost_nanos",out var nanos)==true) return Number(nanos)/1_000_000_000d; return 0;
	}

	private static IReadOnlyList<Dictionary<string,string>> TryGetWarnings(Dictionary<string,object?> response)
	{
		if(!response.TryGetValue("warnings",out var raw)) return Array.Empty<Dictionary<string,string>>();
		return AsObjectList(raw).Select(item=>item.ToDictionary(pair=>pair.Key,pair=>pair.Value?.ToString()??string.Empty)).ToList();
	}

    private static IReadOnlyList<Dictionary<string, object?>> ToResponsesInput(IReadOnlyList<Message> messages)
    {
        var items = new List<Dictionary<string, object?>>();
        foreach (var message in messages)
        {
            if (message.Role == "system")
            {
                continue;
            }

            if (message.Role == "tool")
            {
                items.Add(new Dictionary<string, object?>
                {
                    ["type"] = "function_call_output",
                    ["call_id"] = message.ToolCallId,
                    ["output"] = Stringify(message.Content),
                });
                continue;
            }

            var item = new Dictionary<string, object?>
            {
                ["type"] = "message",
                ["role"] = message.Role,
                ["content"] = Stringify(message.Content),
            };

            if (message.Role == "assistant" && message.ToolCalls is { Count: > 0 })
            {
                item["tool_calls"] = message.ToolCalls.Select(toolCall => new Dictionary<string, object?>
                {
                    ["id"] = toolCall.Id,
                    ["type"] = "function",
                    ["function"] = new Dictionary<string, object?>
                    {
                        ["name"] = toolCall.Name,
                        ["arguments"] = JsonSerializer.Serialize(toolCall.Input),
                    },
                }).ToList();
            }

            items.Add(item);
        }
        return items;
    }

    private static string? ToInstructions(IReadOnlyList<Message> messages, string? overrideValue)
    {
        var systemText = string.Join(
            "\n\n",
            messages
                .Where(message => message.Role == "system" && !string.IsNullOrWhiteSpace(message.Content))
                .Select(message => message.Content.Trim()));

        if (!string.IsNullOrWhiteSpace(overrideValue) && !string.IsNullOrWhiteSpace(systemText))
        {
            return $"{overrideValue}\n\n{systemText}";
        }

        return !string.IsNullOrWhiteSpace(overrideValue)
            ? overrideValue
            : (string.IsNullOrWhiteSpace(systemText) ? null : systemText);
    }

    private static IReadOnlyList<ToolCall> ExtractToolCalls(Dictionary<string, object?> response)
    {
        var items = ExtractItems(response);
        var calls = new List<ToolCall>();
        foreach (var (item, index) in items.Select((item, index) => (item, index)))
        {
            if (!string.Equals(TryGetString(item, "type"), "function_call", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            calls.Add(new ToolCall(
                Id: TryGetString(item, "call_id") ?? $"tool_call_{index}",
                Name: TryGetString(item, "name") ?? "tool",
                Input: SafeParseToolInput(TryGetString(item, "arguments"))
            ));
        }
        return calls;
    }

    private static string ExtractAssistantText(Dictionary<string, object?> response)
    {
        var parts = new List<string>();
        foreach (var item in ExtractItems(response))
        {
            if (!string.Equals(TryGetString(item, "type"), "message", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (!item.TryGetValue("content", out var contentValue))
            {
                continue;
            }

            foreach (var contentPart in AsObjectList(contentValue))
            {
                if (string.Equals(TryGetString(contentPart, "type"), "output_text", StringComparison.OrdinalIgnoreCase))
                {
                    var text = TryGetString(contentPart, "text");
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        parts.Add(text);
                    }
                }
            }
        }

        return string.Join("\n\n", parts);
    }

    private static IReadOnlyList<Dictionary<string, object?>> ExtractItems(Dictionary<string, object?> response)
    {
        if (response.TryGetValue("output_items", out var outputItems))
        {
            return AsObjectList(outputItems);
        }
        if (response.TryGetValue("output", out var output))
        {
            return AsObjectList(output);
        }
        return Array.Empty<Dictionary<string, object?>>();
    }

    private static IReadOnlyList<Dictionary<string, object?>> AsObjectList(object? value)
    {
        if (value is IEnumerable<Dictionary<string, object?>> typedList)
        {
            return typedList.ToList();
        }

        if (value is IEnumerable<object?> list)
        {
            return list
                .Select(item => item switch
                {
                    Dictionary<string, object?> dictionary => dictionary,
                    JsonElement element => JsonSerializer.Deserialize<Dictionary<string, object?>>(element.GetRawText()),
                    _ => null,
                })
                .Where(item => item is not null)
                .Cast<Dictionary<string, object?>>()
                .ToList();
        }

        if (value is JsonElement json && json.ValueKind == JsonValueKind.Array)
        {
            return JsonSerializer.Deserialize<List<Dictionary<string, object?>>>(json.GetRawText())
                ?? new List<Dictionary<string, object?>>();
        }

        return Array.Empty<Dictionary<string, object?>>();
    }

    private static object SafeParseToolInput(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return new Dictionary<string, object?>();
        }

        try
        {
            return JsonSerializer.Deserialize<object>(raw) ?? new Dictionary<string, object?>();
        }
        catch
        {
            return new Dictionary<string, object?> { ["raw"] = raw };
        }
    }

    private static string Stringify(object? value)
    {
        return value switch
        {
            null => string.Empty,
            string text => text,
            _ => JsonSerializer.Serialize(value),
        };
    }

    private static string? ToPresetAlias(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim().TrimStart('@');
        return normalized.Length == 0 ? null : $"@{normalized}";
    }

    private static string FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }
        return string.Empty;
    }

    private static string? TryGetString(Dictionary<string, object?> source, string key)
    {
        if (!source.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        return value switch
        {
            string text when !string.IsNullOrWhiteSpace(text) => text,
            JsonElement json when json.ValueKind == JsonValueKind.String => json.GetString(),
            _ => value.ToString(),
        };
    }

    private static Dictionary<string, object?>? TryGetDictionary(Dictionary<string, object?> source, string key)
    {
        if (!source.TryGetValue(key, out var value) || value is null)
        {
            return null;
        }

        return value switch
        {
            Dictionary<string, object?> dict => dict,
            JsonElement json when json.ValueKind == JsonValueKind.Object =>
                JsonSerializer.Deserialize<Dictionary<string, object?>>(json.GetRawText()),
            _ => null,
        };
    }
}

public sealed class Agent
{
    private readonly AgentDefinition _definition;

    internal Agent(AgentDefinition definition)
    {
        _definition = definition with
        {
            Tools = definition.Tools ?? Array.Empty<Tool>(),
            MaxSteps = definition.MaxSteps > 0 ? definition.MaxSteps : 12,
        };
    }

	private sealed record ToolExecutionOutcome(Message Message, bool ContextWasSet, object? Context);

	private async Task<ToolExecutionOutcome> ExecuteTool(Tool tool, ToolCall call, RunRecord run, int stepIndex, CancellationToken cancellationToken, Action<AgentEvent>? onEvent)
	{
		var checkedCall=call with { Input=Validate(tool.InputSchema,call.Input,"tool input") }; var contextValue=run.Context; var contextWasSet=false;
		Emit(onEvent,"tool.started",run,new(){["step_index"]=stepIndex,["tool_call_id"]=call.Id,["tool_name"]=call.Name});
		using var timeout=CancellationTokenSource.CreateLinkedTokenSource(cancellationToken); if(tool.Timeout is not null) timeout.CancelAfter(tool.Timeout.Value);
		Task EmitProgress(object? value)
		{
			var checkedValue = Validate(tool.EventSchema, value, "tool progress event");
			Emit(onEvent, "tool.preliminary_result", run, new Dictionary<string, object?> { ["step_index"] = stepIndex, ["tool_call_id"] = call.Id, ["tool_name"] = call.Name, ["result"] = checkedValue });
			return Task.CompletedTask;
		}
		void SetContext(object? value) { contextValue = value; contextWasSet = true; }
		var runtime = new RuntimeContext(run.Id, run.AgentId, stepIndex, contextValue, timeout.Token, checkedCall, EmitProgress, SetContext);
		try {
			var task=tool.Execute!(checkedCall.Input,runtime); var output=tool.Timeout is null?await task.ConfigureAwait(false):await task.WaitAsync(tool.Timeout.Value,cancellationToken).ConfigureAwait(false); output=Validate(tool.OutputSchema,output,"tool output");
			Emit(onEvent,"tool.completed",run,new(){["step_index"]=stepIndex,["tool_call_id"]=call.Id,["tool_name"]=call.Name,["output"]=output});
			return new ToolExecutionOutcome(new Message("tool",Stringify(output),ToolCallId:call.Id,Name:tool.Id),contextWasSet,contextValue);
		} catch(Exception error) when(tool.OnError=="return-to-model") {
			Emit(onEvent,"tool.failed",run,new(){["step_index"]=stepIndex,["tool_call_id"]=call.Id,["tool_name"]=call.Name,["error"]=error.Message});
			return new ToolExecutionOutcome(new Message("tool",Stringify(new{error=error.Message}),ToolCallId:call.Id,Name:tool.Id,IsError:true),contextWasSet,contextValue);
		}
	}

    public async Task<RunResult> Run(RunOptions options)
    {
        var startedAt = DateTimeOffset.UtcNow;
        var runId = Guid.NewGuid().ToString("N");
        var messages = new List<Message>();
        if (!string.IsNullOrWhiteSpace(_definition.Instructions))
        {
            messages.Add(new Message("system", _definition.Instructions!));
        }
        messages.Add(new Message("user", Stringify(options.Input)));

        var createdAt = NowIso();
        var run = new RunRecord { Id = runId, AgentId = _definition.Id, Status = "queued", Input = options.Input, Context = options.Context, Messages = messages, CreatedAt = createdAt, UpdatedAt = createdAt };
        Emit(options.OnEvent, "run.started", run);
        try
        {
            var result = await Execute(run, [], options.Client, options.Context, options.Model, options.Preset, options.MaxSteps, options.ModelRetry, options.ToolExecution, options.CancellationToken, options.OnEvent).ConfigureAwait(false);
            if (options.State is not null) await options.State.Save(result, options.CancellationToken).ConfigureAwait(false);
            CaptureDevtools(result, "agent.run", startedAt, options.Devtools);
            return result;
        }
        catch (Exception error)
        {
            CaptureDevtools(null, "agent.run", startedAt, options.Devtools, error, runId);
            throw;
        }
    }

    private sealed class StreamingAdapter(IStreamingModelClient client, Action<AgentEvent>? handler) : IModelClient
    {
        public async Task<ModelResponse> Generate(ModelRequest request)
        {
            var text = ""; ModelResponse? completed = null;
            await foreach (var item in client.Stream(request with { Stream = true }).WithCancellation(request.CancellationToken))
            {
                if (item.Type == "response.output_text.delta") text += item.Delta;
                if (item.Type == "response.completed") completed = item.Response;
                handler?.Invoke(new AgentEvent(item.Type, "stream", request.AgentId, NowIso(), "running", new() { ["delta"] = item.Delta, ["item"] = item.Item }));
            }
            return completed ?? new ModelResponse(new Message("assistant", text));
        }
    }

    public AgentStreamResult Stream(RunOptions options)
    {
		var cancellation = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken);
		var stream = new AgentStreamResult { Cancellation = cancellation }; var original = options.OnEvent;
        Action<AgentEvent> handler = value => { stream.Publish(value); original?.Invoke(value); };
        var client = options.Client is IStreamingModelClient streaming ? new StreamingAdapter(streaming, handler) : options.Client;
		stream.Completion = Run(options with { Client = client, OnEvent = handler, CancellationToken = cancellation.Token });
        return stream;
    }

    public async Task<RunResult> ContinueRun(ContinueOptions options)
    {
        var sourceResult = options.Run ?? (options.State is not null && options.RunId is not null ? await options.State.Load(options.RunId, options.CancellationToken).ConfigureAwait(false) : null) ?? throw new InvalidOperationException("A run or state accessor with runId is required");
        if (!string.Equals(sourceResult.Run.AgentId, _definition.Id, StringComparison.Ordinal)) throw new InvalidOperationException($"Run {sourceResult.Run.Id} belongs to agent {sourceResult.Run.AgentId}");
        if (sourceResult.Run.Status == "waiting_for_human" && string.IsNullOrWhiteSpace(options.HumanInput) && sourceResult.Run.Pause?.PendingToolCalls is not { Count: > 0 }) throw new InvalidOperationException($"Run {sourceResult.Run.Id} is waiting for human input");
        var startedAt = DateTimeOffset.UtcNow;
        var messages = sourceResult.Run.Messages.ToList();
        if (!string.IsNullOrWhiteSpace(options.HumanInput)) messages.Add(new Message("user", options.HumanInput!));
        var run = sourceResult.Run;
        if (string.IsNullOrWhiteSpace(options.HumanInput) && run.Pause?.PendingToolCalls is { Count: > 0 } pending)
        {
            var approved = options.Approvals.ToDictionary(item => item.ToolCallId);
            var rejected = options.Rejections.ToDictionary(item => item.ToolCallId);
            var outputs = options.ToolOutputs.ToDictionary(item => item.ToolCallId, item => item.Output);
            var tools = _definition.Tools.ToDictionary(item => item.Id);
            foreach (var item in pending)
            {
                var currentTool = tools[item.Call.Name];
                if (rejected.TryGetValue(item.Call.Id, out var rejection)) { messages.Add(new Message("tool", Stringify(new { error = rejection.Reason ?? "Tool call rejected" }), ToolCallId: item.Call.Id, Name: item.Call.Name, IsError: true)); continue; }
                object? value;
				var resumedContext=run.Context; var resumedContextWasSet=false;
				var runtime = new RuntimeContext(run.Id, run.AgentId, run.StepCount - 1, resumedContext, options.CancellationToken, item.Call,SetContext:value=>{resumedContext=value;resumedContextWasSet=true;});
                if (item.Kind == "approval")
                {
                    if (!approved.ContainsKey(item.Call.Id)) throw new InvalidOperationException($"Missing approval decision for tool call {item.Call.Id}");
					var outcome=await ExecuteTool(currentTool,item.Call,run,run.StepCount-1,options.CancellationToken,options.OnEvent).ConfigureAwait(false); messages.Add(outcome.Message); if(outcome.ContextWasSet) run=run with{Context=outcome.Context}; if(currentTool.NextTurnParams is not null) run=run with{NextTurn=currentTool.NextTurnParams}; continue;
                }
                else
                {
                    if (!outputs.TryGetValue(item.Call.Id, out value)) throw new InvalidOperationException($"Missing output for tool call {item.Call.Id}");
                    if (currentTool.OnResponseReceived is not null) value = await currentTool.OnResponseReceived(value, runtime).ConfigureAwait(false);
                }
                value = Validate(currentTool.OutputSchema, value, "tool output");
                messages.Add(new Message("tool", Stringify(value), ToolCallId: item.Call.Id, Name: item.Call.Name));
				if(resumedContextWasSet) run=run with{Context=resumedContext};
				if(currentTool.NextTurnParams is not null) run=run with{NextTurn=currentTool.NextTurnParams};
            }
        }
        run = run with { Status = "running", Messages = messages, Pause = null, UpdatedAt = NowIso() };
        Emit(options.OnEvent, "run.resumed", run, new() { ["previous_status"] = sourceResult.Run.Status });
        try
        {
            var result = await Execute(run, sourceResult.Steps.ToList(), options.Client, options.Context ?? run.Context, options.Model, options.Preset, options.MaxSteps, options.ModelRetry, options.ToolExecution, options.CancellationToken, options.OnEvent).ConfigureAwait(false);
            if (options.State is not null) await options.State.Save(result, options.CancellationToken).ConfigureAwait(false);
            CaptureDevtools(result, "agent.continue", startedAt, options.Devtools);
            return result;
        }
        catch (Exception error)
        {
            CaptureDevtools(null, "agent.continue", startedAt, options.Devtools, error, run.Id);
            throw;
        }
    }

	public AgentStreamResult ContinueStream(ContinueOptions options)
	{
		var cancellation=CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken);var stream=new AgentStreamResult{Cancellation=cancellation};var original=options.OnEvent;Action<AgentEvent> handler=value=>{stream.Publish(value);original?.Invoke(value);};var client=options.Client is IStreamingModelClient streaming?new StreamingAdapter(streaming,handler):options.Client;stream.Completion=ContinueRun(options with{Client=client,OnEvent=handler,CancellationToken=cancellation.Token});return stream;
	}

    private async Task<RunResult> Execute(RunRecord run, List<RunStep> steps, IModelClient client, object? context, string? model, string? preset, int? requestedMaxSteps, ModelRetryConfig? retryOverride, ToolExecutionConfig? executionOverride, CancellationToken cancellationToken, Action<AgentEvent>? onEvent)
    {
        var maxSteps = requestedMaxSteps.GetValueOrDefault() > 0 ? requestedMaxSteps!.Value : _definition.MaxSteps;
        var retry = retryOverride ?? _definition.ModelRetry;
        var backoff = retry.Backoff ?? TimeSpan.FromMilliseconds(250);
        var execution = executionOverride ?? _definition.ToolExecution;
        var toolsById = _definition.Tools.ToDictionary(tool => tool.Id, StringComparer.Ordinal);
        var targetModel = FirstNonEmpty(model, ToPresetAlias(preset), _definition.Model, ToPresetAlias(_definition.Preset));
        NextTurnParams? nextTurn = run.NextTurn;
        var loopStarted = DateTimeOffset.UtcNow;
        run = run with { Status = "running", NextTurn = null };

        for (var stepIndex = run.StepCount; stepIndex < maxSteps; stepIndex++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var turn = new TurnContext(stepIndex + 1, stepIndex, run.Messages, run.Context);
            var turnModel = _definition.DynamicModel?.Invoke(turn) ?? targetModel; var turnInstructions = _definition.DynamicInstructions?.Invoke(turn) ?? _definition.Instructions;
            var temperature = _definition.Temperature?.Invoke(turn); var maxOutputTokens = _definition.MaxOutputTokens?.Invoke(turn); var topP = _definition.TopP?.Invoke(turn); var turnTools = _definition.DynamicTools?.Invoke(turn) ?? _definition.Tools;
            if (nextTurn is not null) { turnModel = nextTurn.Model ?? turnModel; turnInstructions = nextTurn.Instructions ?? turnInstructions; temperature = nextTurn.Temperature ?? temperature; maxOutputTokens = nextTurn.MaxOutputTokens ?? maxOutputTokens; topP = nextTurn.TopP ?? topP; turnTools = nextTurn.Tools ?? turnTools; nextTurn = null; }
            toolsById = turnTools.ToDictionary(tool => tool.Id, StringComparer.Ordinal);
            var step = new RunStep { Index = stepIndex, Status = "executing_model" };
            steps.Add(step);
            Emit(onEvent, "step.started", run, new() { ["step_index"] = stepIndex });
            ModelResponse? response = null;
            for (var attempt = 0; attempt <= Math.Max(0, retry.MaxRetries); attempt++)
            {
                step = step with { ModelAttempts = attempt + 1 }; steps[^1] = step;
                Emit(onEvent, "model.requested", run, new() { ["step_index"] = stepIndex, ["attempt"] = attempt + 1, ["model"] = turnModel });
                try
                {
                    response = await client.Generate(new ModelRequest(_definition.Id, run.Messages, turnTools, turnModel, turnInstructions, run.Context, cancellationToken, temperature, maxOutputTokens, topP)).ConfigureAwait(false);
                    break;
                }
                catch when (attempt < retry.MaxRetries)
                {
                    await Task.Delay(TimeSpan.FromMilliseconds(backoff.TotalMilliseconds * (attempt + 1)), cancellationToken).ConfigureAwait(false);
                }
            }
            if (response is null) throw new InvalidOperationException("Model client returned no response");
            var messages = run.Messages.ToList(); messages.Add(response.Message);
            run = run with { Messages = messages, StepCount = stepIndex + 1, UpdatedAt = NowIso() };
            var currentUsage = NormalizeUsage(response);
            run = run with { Usage = new UsageSummary(run.Usage.InputTokens + currentUsage.InputTokens, run.Usage.OutputTokens + currentUsage.OutputTokens, run.Usage.CachedTokens + currentUsage.CachedTokens, run.Usage.TotalTokens + currentUsage.TotalTokens, run.Usage.Cost + currentUsage.Cost) };
            step = step with { ToolCalls = response.Message.ToolCalls ?? Array.Empty<ToolCall>(), RequestId = response.RequestId, NativeResponseId = response.NativeResponseId, Provider = response.Provider, Model = response.Model ?? turnModel, Usage = response.Usage, ResponseMeta = response.ResponseMeta, FinishReason=response.FinishReason, Warnings=response.Warnings??Array.Empty<Dictionary<string,string>>() };
            steps[^1] = step;
            Emit(onEvent, "model.completed", run, new() { ["step_index"] = stepIndex, ["attempt"] = step.ModelAttempts, ["request_id"] = step.RequestId, ["model"] = step.Model });
            object? parsedOutput = response.Message.ToolCalls is not { Count: > 0 } && _definition.ParseOutput is not null ? _definition.ParseOutput(response.Message.Content) : null;
            if (_definition.HumanReview is not null)
            {
                var review = await _definition.HumanReview(new HumanReviewContext(run.Id, run.AgentId, stepIndex, run.Input, context, run.Messages, response, parsedOutput)).ConfigureAwait(false);
                if (review is not null)
                {
                    run = run with { Status = "waiting_for_human", Pause = new HumanPause(review.Reason, review.Payload, NowIso()) };
                    steps[^1] = step with { Status = "checkpointed" };
                    Emit(onEvent, "checkpoint.saved", run, new() { ["step_index"] = stepIndex });
                    Emit(onEvent, "run.waiting_for_human", run, new() { ["step_index"] = stepIndex, ["pause"] = run.Pause });
                    return new RunResult { Run = run, Steps = steps, Messages = run.Messages };
                }
            }
            if (response.Message.ToolCalls is not { Count: > 0 })
            {
                var output = _definition.ParseOutput is not null ? parsedOutput : response.Message.Content;
                output = Validate(_definition.OutputSchema, output, "agent output");
                foreach (var condition in _definition.StopWhen)
                {
                    var decision = condition(new StopState(run.StepCount, run.Usage, response.Message.ToolCalls ?? Array.Empty<ToolCall>(), response.FinishReason, DateTimeOffset.UtcNow - loopStarted));
                    if (decision.Stop) { run = run with { Status = "stopped", StopReason = decision.Reason, Result = output }; return new RunResult { Run = run, Steps = steps, Output = output, Messages = run.Messages, Usage = run.Usage }; }
                }
                run = run with { Status = "completed", Result = output, Pause = null };
                steps[^1] = step with { Status = "checkpointed" };
                Emit(onEvent, "checkpoint.saved", run, new() { ["step_index"] = stepIndex });
                Emit(onEvent, "run.completed", run, new() { ["output"] = output });
                return new RunResult { Run = run, Steps = steps, Output = output, Messages = run.Messages, Usage = run.Usage };
            }

            run = run with { Status = "waiting_for_tools" };
            steps[^1] = step with { Status = "executing_tools" };
            var automatic = new List<(Tool Tool, ToolCall Call)>();
            var pendingCalls = new List<PendingToolCall>();
            foreach (var call in response.Message.ToolCalls)
            {
                if (!toolsById.TryGetValue(call.Name, out var currentTool)) throw new InvalidOperationException($"Unknown tool '{call.Name}'");
                var checkedCall = call with { Input = Validate(currentTool.InputSchema, call.Input, "tool input") };
                var runtime = new RuntimeContext(run.Id, run.AgentId, stepIndex, run.Context, cancellationToken, checkedCall);
                if (currentTool.OnToolCalled is not null)
                {
                    var prefetched = await currentTool.OnToolCalled(checkedCall.Input, runtime).ConfigureAwait(false);
                    if (!prefetched.Completed) pendingCalls.Add(new PendingToolCall(checkedCall, "hitl", "Tool requires human input"));
                    else automatic.Add((currentTool with { Execute = (_, _) => Task.FromResult(prefetched.Output) }, checkedCall));
                    continue;
                }
                var gated = currentTool.RequireApproval;
                if (currentTool.Approval is not null) gated = await currentTool.Approval(checkedCall.Input, runtime).ConfigureAwait(false);
                if (_definition.RequireApproval is not null) gated = await _definition.RequireApproval(checkedCall, runtime).ConfigureAwait(false);
                if (gated) pendingCalls.Add(new PendingToolCall(checkedCall, "approval", "Tool requires approval"));
                else if (currentTool.Execute is null) pendingCalls.Add(new PendingToolCall(checkedCall, "manual", "Tool requires external output"));
                else automatic.Add((currentTool, checkedCall));
            }
            using var semaphore = new SemaphoreSlim(Math.Max(1, execution.Concurrency));
            var toolMessages = new Message[automatic.Count];
			var outcomes = new ToolExecutionOutcome[automatic.Count];
			await Task.WhenAll(automatic.Select(async (entry, index) =>
            {
                var (tool, toolCall) = entry;
                await semaphore.WaitAsync(cancellationToken).ConfigureAwait(false);
                try
                {
					outcomes[index]=await ExecuteTool(tool,toolCall,run,stepIndex,cancellationToken,onEvent).ConfigureAwait(false); toolMessages[index]=outcomes[index].Message;
                }
                finally { semaphore.Release(); }
            })).ConfigureAwait(false);
			foreach(var outcome in outcomes) if(outcome.ContextWasSet) run=run with{Context=outcome.Context};
            messages = run.Messages.ToList(); messages.AddRange(toolMessages);
            run = run with { Messages = messages };
            foreach (var entry in automatic) if (entry.Tool.NextTurnParams is not null) nextTurn = entry.Tool.NextTurnParams;
            if (pendingCalls.Count > 0)
            {
                run = run with { Status = "waiting_for_human", Pause = new HumanPause("Pending tool calls require input", pendingCalls, NowIso(), "tool_approval", pendingCalls), NextTurn = nextTurn };
                steps[^1] = steps[^1] with { Status = "checkpointed" };
                return new RunResult { Run = run, Steps = steps, Messages = run.Messages, Usage = run.Usage };
            }
            foreach(var condition in _definition.StopWhen){var decision=condition(new StopState(run.StepCount,run.Usage,response.Message.ToolCalls, response.FinishReason,DateTimeOffset.UtcNow-loopStarted));if(decision.Stop){run=run with{Status="stopped",StopReason=decision.Reason,Result=response.Message.Content};return new RunResult{Run=run,Steps=steps,Output=run.Result,Messages=run.Messages,Usage=run.Usage};}}
            steps[^1] = steps[^1] with { Status = "checkpointed" };
            Emit(onEvent, "checkpoint.saved", run, new() { ["step_index"] = stepIndex });
        }
        run = run with { Status = "failed", Error = $"Max steps exceeded ({maxSteps})" };
        Emit(onEvent, "run.failed", run, new() { ["error"] = run.Error });
        throw new InvalidOperationException(run.Error);
    }

    private static string NowIso() => DateTimeOffset.UtcNow.ToString("O");

    private static object? Validate(Func<object?, object?>? schema, object? value, string label)
    {
        if (schema is null) return value;
        try { return schema(value); }
        catch (Exception error) { throw new ArgumentException($"Invalid {label}: {error.Message}", error); }
    }

    private static UsageSummary NormalizeUsage(ModelResponse response)
    {
        static int Read(Dictionary<string, object?>? usage, params string[] keys)
        {
            foreach (var key in keys) if (usage?.TryGetValue(key, out var value) == true) return Convert.ToInt32(value);
            return 0;
        }
        var input = Read(response.Usage, "input_tokens", "prompt_tokens"); var output = Read(response.Usage, "output_tokens", "completion_tokens");
        var total = Read(response.Usage, "total_tokens"); if (total == 0) total = input + output;
        return new UsageSummary(input, output, Read(response.Usage, "cached_tokens", "cache_read_input_tokens"), total, response.Cost);
    }

    private static void Emit(Action<AgentEvent>? handler, string type, RunRecord run, Dictionary<string, object?>? details = null) => handler?.Invoke(new AgentEvent(type, run.Id, run.AgentId, NowIso(), run.Status, details));

    private void CaptureDevtools(RunResult? result, string operation, DateTimeOffset startedAt, AgentDevtoolsConfig? config, Exception? error = null, string? runId = null)
    {
        var enabled = config?.Enabled ?? string.Equals(Environment.GetEnvironmentVariable("PHASEO_DEVTOOLS"), "true", StringComparison.OrdinalIgnoreCase);
        if (!enabled) return;
        var directory = config?.Directory ?? Environment.GetEnvironmentVariable("PHASEO_DEVTOOLS_DIR") ?? ".phaseo-devtools";
        foreach (var kind in new[] { "images", "audio", "video" }) Directory.CreateDirectory(Path.Combine(directory, "assets", kind));
        var metadataPath = Path.Combine(directory, "metadata.json");
        if (!File.Exists(metadataPath)) File.WriteAllText(metadataPath, JsonSerializer.Serialize(new { session_id = Guid.NewGuid(), started_at = startedAt.ToUnixTimeMilliseconds(), sdk = "csharp" }, new JsonSerializerOptions { WriteIndented = true }));
        var entry = new { id = result?.Run.Id ?? runId ?? Guid.NewGuid().ToString("N"), type = operation, timestamp = startedAt.ToUnixTimeMilliseconds(), request = new { agent_id = _definition.Id, tool_count = _definition.Tools.Count }, response = result, error = error is null ? null : new { message = error.Message }, metadata = new { sdk = "csharp", agent_id = _definition.Id, run_id = result?.Run.Id ?? runId, run_status = result?.Run.Status } };
        File.AppendAllText(Path.Combine(directory, "generations.jsonl"), JsonSerializer.Serialize(entry) + Environment.NewLine);
    }

    private static string Stringify(object? value)
    {
        return value switch
        {
            null => string.Empty,
            string text => text,
            _ => JsonSerializer.Serialize(value, new JsonSerializerOptions { WriteIndented = true }),
        };
    }

    private static string FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }
        return string.Empty;
    }

    private static string? ToPresetAlias(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim().TrimStart('@');
        return normalized.Length == 0 ? null : $"@{normalized}";
    }
}

public static class AgentSdk
{
    public static AgentDevtoolsConfig CreateAgentDevtools(string directory = ".phaseo-devtools") => new(true, directory);

    public static Tool DefineTool(Tool tool) => tool;
    public static Func<StopState,(bool Stop,string Reason)> StepCountIs(int limit) => state => (state.StepCount >= limit, $"step_count:{limit}");
    public static Func<StopState,(bool Stop,string Reason)> MaxTokensUsed(int limit) => state => (state.Usage.TotalTokens >= limit, $"max_tokens:{limit}");
    public static Func<StopState,(bool Stop,string Reason)> MaxCost(double limit) => state => (state.Usage.Cost >= limit, $"max_cost:{limit}");
    public static Func<StopState,(bool Stop,string Reason)> MaxDuration(TimeSpan limit) => state => (state.Elapsed >= limit, $"max_duration:{limit}");
    public static Func<StopState,(bool Stop,string Reason)> HasToolCall(string name) => state => (state.ToolCalls.Any(call => call.Name == name), $"tool_call:{name}");
    public static Func<StopState,(bool Stop,string Reason)> FinishReasonIs(string reason) => state => (state.FinishReason == reason, $"finish_reason:{reason}");

    public static Agent CreateAgent(AgentDefinition definition) => new(definition);

    public static GatewayAgentClient CreateGatewayAgentClient(GatewayAgentClientOptions? options = null)
    {
        options ??= new GatewayAgentClientOptions();
        var client = options.Client;
        if (client is null)
        {
            var apiKey = options.ClientOptions is not null &&
                         options.ClientOptions.TryGetValue("apiKey", out var apiKeyValue)
                ? apiKeyValue?.ToString()
                : Environment.GetEnvironmentVariable("PHASEO_API_KEY");
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                throw new InvalidOperationException("PHASEO_API_KEY is required.");
            }

            var baseUrl = options.ClientOptions is not null &&
                          options.ClientOptions.TryGetValue("baseUrl", out var baseUrlValue)
                ? baseUrlValue?.ToString()
                : Environment.GetEnvironmentVariable("PHASEO_BASE_URL");
            var httpClient = new HttpClient();
            httpClient.DefaultRequestHeaders.Add("X-Phaseo-Client", "phaseo-agent-csharp");
            httpClient.DefaultRequestHeaders.Add("X-Phaseo-Client-Version", "0.3.0");
            client = new PhaseoSdk.Phaseo(apiKey: apiKey, basePath: baseUrl ?? "https://api.phaseo.app/v1", httpClient: httpClient);
        }

        return new GatewayAgentClient(client, options);
    }
}
