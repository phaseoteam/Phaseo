using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using AiStatsSdk;
using Xunit;

namespace AIStats.Sdk.Tests;

public class CurrentApiKeyTests
{
    [Fact]
    public async Task GetCurrentApiKeyReturnsPayload()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/key")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"data\":{\"id\":\"key_123\",\"prefix\":\"aistats_v1_sk_test\",\"status\":\"active\"}}", Encoding.UTF8, "application/json")
                };
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("{\"error\":\"not found\"}", Encoding.UTF8, "application/json")
            };
        });

        using var httpClient = new HttpClient(handler);
        var client = new AiStatsSdk.AIStats(
            apiKey: "test",
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: httpClient);

        var response = await client.GetCurrentApiKey();

        Assert.NotNull(response);
        var data = Assert.IsType<JsonElement>(response!["data"]);
        Assert.Equal("key_123", data.GetProperty("id").GetString());
        Assert.Equal("active", data.GetProperty("status").GetString());
    }

    private sealed class StubHttpHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

        public StubHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(_handler(request));
        }
    }
}
