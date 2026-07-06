using System.Text.Json;
using PhaseoSdk;

namespace PhaseoAgentSdk;

public sealed record ToolCall(string Id, string Name, object? Input);

public sealed record Message(
    string Role,
    string Content,
    IReadOnlyList<ToolCall>? ToolCalls = null,
    string? ToolCallId = null,
    string? Name = null
);

public sealed record Tool(
    string Id,
    Func<object?, RuntimeContext, Task<object?>> Execute,
    string? Description = null,
    Dictionary<string, object?>? Parameters = null
);

public sealed record RuntimeContext(string RunId, string AgentId, int StepIndex, object? Context = null);

public sealed record ModelRequest(
    string AgentId,
    IReadOnlyList<Message> Messages,
    IReadOnlyList<Tool> Tools,
    string? Model = null,
    string? Instructions = null,
    object? Context = null
);

public sealed record ModelResponse(
    Message Message,
    Dictionary<string, object?>? Usage = null,
    string? RequestId = null,
    string? Provider = null,
    string? Model = null,
    Dictionary<string, object?>? ResponseMeta = null
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
    public int MaxSteps { get; init; } = 8;
    public Func<string, object?>? ParseOutput { get; init; }
}

public sealed record RunStep
{
    public required int Index { get; init; }
    public IReadOnlyList<ToolCall> ToolCalls { get; init; } = Array.Empty<ToolCall>();
    public string? RequestId { get; init; }
    public string? Provider { get; init; }
    public string? Model { get; init; }
}

public sealed record RunRecord
{
    public required string Id { get; init; }
    public required string AgentId { get; init; }
    public required string Status { get; init; }
    public object? Input { get; init; }
    public IReadOnlyList<Message> Messages { get; init; } = Array.Empty<Message>();
    public int StepCount { get; init; }
    public object? Result { get; init; }
    public string? Error { get; init; }
}

public sealed record RunResult
{
    public required RunRecord Run { get; init; }
    public IReadOnlyList<RunStep> Steps { get; init; } = Array.Empty<RunStep>();
    public object? Output { get; init; }
    public IReadOnlyList<Message> Messages { get; init; } = Array.Empty<Message>();
}

public sealed record RunOptions
{
    public required object? Input { get; init; }
    public required IModelClient Client { get; init; }
    public object? Context { get; init; }
    public string? Model { get; init; }
    public int? MaxSteps { get; init; }
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
}

public sealed class GatewayAgentClient : IModelClient
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

        var payload = new Dictionary<string, object?>
        {
            ["model"] = model,
            ["input"] = ToResponsesInput(request.Messages),
            ["instructions"] = ToInstructions(request.Messages, request.Instructions),
            ["tools"] = tools,
            ["tool_choice"] = _options.ToolChoice,
            ["parallel_tool_calls"] = _options.ParallelToolCalls,
            ["temperature"] = _options.Temperature,
            ["max_output_tokens"] = _options.MaxOutputTokens,
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

        var response = await _client.CreateResponse(payload!).ConfigureAwait(false)
            ?? new Dictionary<string, object?>();

        return new ModelResponse(
            Message: new Message(
                Role: "assistant",
                Content: ExtractAssistantText(response),
                ToolCalls: ExtractToolCalls(response)
            ),
            Usage: TryGetDictionary(response, "usage"),
            RequestId: TryGetString(response, "id"),
            Provider: TryGetString(response, "provider"),
            Model: TryGetString(response, "model"),
            ResponseMeta: TryGetDictionary(response, "meta")
        );
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
            MaxSteps = definition.MaxSteps > 0 ? definition.MaxSteps : 8,
        };
    }

    public async Task<RunResult> Run(RunOptions options)
    {
        var runId = Guid.NewGuid().ToString("N");
        var messages = new List<Message>();
        if (!string.IsNullOrWhiteSpace(_definition.Instructions))
        {
            messages.Add(new Message("system", _definition.Instructions!));
        }
        messages.Add(new Message("user", Stringify(options.Input)));

        var steps = new List<RunStep>();
        var maxSteps = options.MaxSteps.GetValueOrDefault() > 0
            ? options.MaxSteps!.Value
            : _definition.MaxSteps;
        var toolsById = _definition.Tools.ToDictionary(tool => tool.Id, StringComparer.Ordinal);

        for (var stepIndex = 0; stepIndex < maxSteps; stepIndex++)
        {
            var response = await options.Client.Generate(new ModelRequest(
                AgentId: _definition.Id,
                Model: FirstNonEmpty(options.Model, _definition.Model, ToPresetAlias(_definition.Preset)),
                Instructions: _definition.Instructions,
                Messages: messages,
                Tools: _definition.Tools,
                Context: options.Context
            )).ConfigureAwait(false);

            messages.Add(response.Message);
            steps.Add(new RunStep
            {
                Index = stepIndex,
                ToolCalls = response.Message.ToolCalls ?? Array.Empty<ToolCall>(),
                RequestId = response.RequestId,
                Provider = response.Provider,
                Model = response.Model,
            });

            if (response.Message.ToolCalls is not { Count: > 0 })
            {
                var output = _definition.ParseOutput is not null
                    ? _definition.ParseOutput(response.Message.Content)
                    : response.Message.Content;

                var run = new RunRecord
                {
                    Id = runId,
                    AgentId = _definition.Id,
                    Status = "completed",
                    Input = options.Input,
                    Messages = messages,
                    StepCount = steps.Count,
                    Result = output,
                };

                return new RunResult
                {
                    Run = run,
                    Steps = steps,
                    Output = output,
                    Messages = messages,
                };
            }

            foreach (var toolCall in response.Message.ToolCalls)
            {
                if (!toolsById.TryGetValue(toolCall.Name, out var tool))
                {
                    throw new InvalidOperationException($"Unknown tool '{toolCall.Name}'");
                }

                var toolOutput = await tool.Execute(
                    toolCall.Input,
                    new RuntimeContext(runId, _definition.Id, stepIndex, options.Context)
                ).ConfigureAwait(false);

                messages.Add(new Message(
                    Role: "tool",
                    Content: Stringify(toolOutput),
                    ToolCallId: toolCall.Id,
                    Name: tool.Id
                ));
            }
        }

        throw new InvalidOperationException($"Agent exceeded max_steps={maxSteps}");
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
    public static Tool DefineTool(Tool tool) => tool;

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
            client = new PhaseoSdk.Phaseo(apiKey: apiKey, basePath: baseUrl ?? "https://api.phaseo.ai/v1");
        }

        return new GatewayAgentClient(client, options);
    }
}
