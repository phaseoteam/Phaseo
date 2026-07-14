using System.Net;
using System.Net.Http;
using System.Text;
using PhaseoSdk;
using Xunit;

namespace Phaseo.Sdk.Tests;

public class ChatTests
{
    [Fact]
    public async Task GenerateTextPreservesGatewayMetadata()
    {
        var handler = new StubHttpHandler(async request =>
        {
            if (request.Method == HttpMethod.Post && request.RequestUri?.AbsolutePath == "/chat/completions")
            {
                var payload = await request.Content!.ReadAsStringAsync();
                Assert.Contains("\"model\":\"openai/gpt-5-nano\"", payload, StringComparison.Ordinal);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"id\":\"req_cs_chat_1\",\"nativeResponseId\":\"chatcmpl_cs_1\",\"object\":\"chat.completion\",\"created\":1723000000,\"model\":\"openai/gpt-5-nano\",\"provider\":\"openai\",\"session_id\":\"session_cs_chat_1\",\"upstream_request_id\":\"upstream_cs_chat_1\",\"provider_attempts\":[{\"provider\":\"openai\",\"status_code\":200,\"duration_ms\":412}],\"pricing_lines\":[{\"provider\":\"openai\",\"cost_usd\":0.0025}],\"usage\":{\"input_tokens\":2,\"output_tokens\":1,\"total_tokens\":3},\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\",\"content\":\"hi\"},\"finish_reason\":\"stop\"}]}", Encoding.UTF8, "application/json")
                };
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("{\"error\":\"not found\"}", Encoding.UTF8, "application/json")
            };
        });

        using var httpClient = new HttpClient(handler);
        var client = new PhaseoSdk.Phaseo(
            apiKey: "test",
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: httpClient);

        var response = await client.GenerateText(new Dictionary<string, object>
        {
            ["model"] = "openai/gpt-5-nano",
            ["messages"] = new[]
            {
                new Dictionary<string, object>
                {
                    ["role"] = "user",
                    ["content"] = "hi",
                },
            },
        });

        Assert.NotNull(response);
        Assert.Equal("openai", response!["provider"]?.ToString());
        Assert.Equal("chatcmpl_cs_1", response["nativeResponseId"]?.ToString());
        Assert.Equal("session_cs_chat_1", response["session_id"]?.ToString());
        Assert.Equal("upstream_cs_chat_1", response["upstream_request_id"]?.ToString());
        Assert.NotNull(response["provider_attempts"]);
        Assert.NotNull(response["pricing_lines"]);
        var usage = Assert.IsType<System.Text.Json.JsonElement>(response["usage"]);
        Assert.Equal(2, usage.GetProperty("input_tokens").GetInt32());
        Assert.Equal(1, usage.GetProperty("output_tokens").GetInt32());
        Assert.Equal(3, usage.GetProperty("total_tokens").GetInt32());
    }

    private sealed class StubHttpHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, Task<HttpResponseMessage>> _handler;

        public StubHttpHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> handler)
        {
            _handler = handler;
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return await _handler(request);
        }
    }
}
