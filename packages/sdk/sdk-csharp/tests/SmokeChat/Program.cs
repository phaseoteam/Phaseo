using System.Text.Json;
using PhaseoSdk;

var apiKey = Environment.GetEnvironmentVariable("PHASEO_API_KEY");
if (string.IsNullOrWhiteSpace(apiKey))
{
    throw new InvalidOperationException("PHASEO_API_KEY is required");
}

var baseUrl = Environment.GetEnvironmentVariable("PHASEO_BASE_URL") ?? "https://api.phaseo.ai/v1";
var client = new PhaseoSdk.Phaseo(apiKey, baseUrl);
var model = Environment.GetEnvironmentVariable("PHASEO_SMOKE_MODEL") ?? "openai/gpt-5.4-nano";
var input = Environment.GetEnvironmentVariable("PHASEO_SMOKE_INPUT") ?? "Hi";
var maxOutputTokensRaw = Environment.GetEnvironmentVariable("PHASEO_SMOKE_MAX_OUTPUT_TOKENS");
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
