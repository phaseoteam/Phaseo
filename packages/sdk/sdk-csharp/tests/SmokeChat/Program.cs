using System.Text.Json;
using AiStatsSdk;

var apiKey = Environment.GetEnvironmentVariable("AI_STATS_API_KEY");
if (string.IsNullOrWhiteSpace(apiKey))
{
    throw new InvalidOperationException("AI_STATS_API_KEY is required");
}

var baseUrl = Environment.GetEnvironmentVariable("AI_STATS_BASE_URL") ?? "https://api.phaseo.app/v1";
var client = new AIStats(apiKey, baseUrl);
var model = Environment.GetEnvironmentVariable("AI_STATS_SMOKE_MODEL") ?? "openai/gpt-5-nano";
var input = Environment.GetEnvironmentVariable("AI_STATS_SMOKE_INPUT") ?? "Hi";
var maxOutputTokensRaw = Environment.GetEnvironmentVariable("AI_STATS_SMOKE_MAX_OUTPUT_TOKENS");
var maxOutputTokens = int.TryParse(maxOutputTokensRaw, out var parsedMaxOutputTokens) && parsedMaxOutputTokens > 0
    ? parsedMaxOutputTokens
    : 32;

var mode = args.Length > 0 ? args[0].Trim().ToLowerInvariant() : "chat";

Dictionary<string, object>? result;
if (mode == "responses")
{
    var payload = new Dictionary<string, object>
    {
        ["model"] = model,
        ["input"] = input,
        ["max_output_tokens"] = maxOutputTokens,
    };
    result = await client.CreateResponse(payload);
}
else
{
    var payload = new Dictionary<string, object>
    {
        ["model"] = model,
        ["messages"] = new[]
        {
            new Dictionary<string, object> { ["role"] = "user", ["content"] = input }
        }
    };
    result = await client.CreateChatCompletion(payload);
}

var json = JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true });
Console.WriteLine(json);
