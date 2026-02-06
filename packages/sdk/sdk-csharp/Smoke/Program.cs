using System.Net.Http.Headers;
using System.Text.Json;
using AiStatsSdk;
using AiStatsSdk.Model;

record Operation(string Method, string Path, int ExpectStatus, JsonElement Body);

record Manifest(string? ApiKeyEnv, string? BaseUrlEnv, string DefaultBaseUrl, Dictionary<string, Operation> Operations);

static Manifest LoadManifest()
{
    var manifestPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "smoke-manifest.json"));
    var json = File.ReadAllText(manifestPath);
    var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
    return JsonSerializer.Deserialize<Manifest>(json, opts) ?? throw new InvalidOperationException("manifest missing");
}

static HttpClient CreateHttp() => new() { Timeout = TimeSpan.FromSeconds(30) };

var manifest = LoadManifest();
var apiKeyEnv = manifest.ApiKeyEnv ?? "AI_STATS_API_KEY";
var baseUrlEnv = manifest.BaseUrlEnv ?? "AI_STATS_BASE_URL";
var apiKey = Environment.GetEnvironmentVariable(apiKeyEnv);
if (string.IsNullOrWhiteSpace(apiKey))
{
    Console.Error.WriteLine($"Set {apiKeyEnv}");
    return 1;
}

var baseUrl = (Environment.GetEnvironmentVariable(baseUrlEnv) ?? manifest.DefaultBaseUrl).TrimEnd('/');
var http = CreateHttp();

// Health
var healthOp = manifest.Operations["health"];
var healthReq = new HttpRequestMessage(new HttpMethod(healthOp.Method), $"{baseUrl}{healthOp.Path}");
healthReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
var healthRes = await http.SendAsync(healthReq);
if ((int)healthRes.StatusCode != healthOp.ExpectStatus)
{
    throw new InvalidOperationException($"health status {(int)healthRes.StatusCode}");
}

var healthJson = JsonDocument.Parse(await healthRes.Content.ReadAsStringAsync());
if (!healthJson.RootElement.TryGetProperty("status", out _))
{
    throw new InvalidOperationException("health status missing");
}

var client = new Client(apiKey, baseUrl);

// Models
var models = client.GetModels();
if (models.Models == null || models.Models.Count == 0)
{
    throw new InvalidOperationException("models list empty");
}

// Chat completion
var chatOp = manifest.Operations["chat"];
var jsonOpts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
var chatReq = JsonSerializer.Deserialize<ChatCompletionsRequest>(chatOp.Body.GetRawText(), jsonOpts)
             ?? throw new InvalidOperationException("chat payload parse failed");
var chat = client.GenerateText(chatReq);
if (chat.Choices == null || chat.Choices.Count == 0)
{
    throw new InvalidOperationException("chat choices empty");
}

// Unauthorized
var unauthOp = manifest.Operations["unauthorized"];
var unauthRes = await http.SendAsync(new HttpRequestMessage(new HttpMethod(unauthOp.Method), $"{baseUrl}{unauthOp.Path}"));
if ((int)unauthRes.StatusCode != unauthOp.ExpectStatus && unauthRes.StatusCode != System.Net.HttpStatusCode.Forbidden)
{
    throw new InvalidOperationException($"unauthorized status {(int)unauthRes.StatusCode}");
}

// Not found with auth
var nfOp = manifest.Operations["notFound"];
var nfReq = new HttpRequestMessage(new HttpMethod(nfOp.Method), $"{baseUrl}{nfOp.Path}");
nfReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
var nfRes = await http.SendAsync(nfReq);
if ((int)nfRes.StatusCode != nfOp.ExpectStatus)
{
    throw new InvalidOperationException($"not-found status {(int)nfRes.StatusCode}");
}

Console.WriteLine("csharp smoke ok");
return 0;
