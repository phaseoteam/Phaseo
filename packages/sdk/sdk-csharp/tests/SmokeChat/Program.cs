using System.Text.Json;
using AiStats.Gen;

var apiKey = Environment.GetEnvironmentVariable("AI_STATS_API_KEY");
if (string.IsNullOrWhiteSpace(apiKey))
{
    throw new InvalidOperationException("AI_STATS_API_KEY is required");
}

var baseUrl = Environment.GetEnvironmentVariable("AI_STATS_BASE_URL") ?? "https://api.phaseo.app/v1";
var headers = new Dictionary<string, string> { { "Authorization", $"Bearer {apiKey}" } };
var client = new Client(baseUrl, headers: headers);

var mode = args.Length > 0 ? args[0].Trim().ToLowerInvariant() : "chat";

Dictionary<string, object>? result;
if (mode == "responses")
{
    var payload = new Dictionary<string, object>
    {
        ["model"] = "openai/gpt-5-nano",
        ["input"] = "Hi"
    };
    result = await Operations.CreateResponseAsync(client, body: payload);
}
else
{
    var payload = new Dictionary<string, object>
    {
        ["model"] = "openai/gpt-5-nano-2025-08-07",
        ["messages"] = new[]
        {
            new Dictionary<string, object> { ["role"] = "user", ["content"] = "Hi" }
        }
    };
    result = await Operations.CreateChatCompletionAsync(client, body: payload);
}

var json = JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true });
Console.WriteLine(json);
