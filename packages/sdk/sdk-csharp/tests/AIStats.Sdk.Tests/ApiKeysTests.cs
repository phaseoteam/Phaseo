using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using AiStatsSdk;
using Xunit;

namespace AIStats.Sdk.Tests;

public class ApiKeysTests
{
    [Fact]
    public async Task ListApiKeysReturnsPayload()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/keys")
            {
                Assert.Contains("disabled=true", request.RequestUri.Query);
                Assert.Contains("limit=2", request.RequestUri.Query);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"object\":\"list\",\"data\":[{\"id\":\"key_123\",\"status\":\"active\"},{\"id\":\"key_456\",\"status\":\"disabled\"}]}", Encoding.UTF8, "application/json")
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

        var response = await client.ListApiKeys(new Dictionary<string, string>
        {
            ["disabled"] = "true",
            ["limit"] = "2",
        });

        Assert.NotNull(response);
        Assert.Equal("list", response!["object"]?.ToString());
        var data = Assert.IsType<JsonElement>(response["data"]);
        Assert.Equal("key_123", data[0].GetProperty("id").GetString());
        Assert.Equal("disabled", data[1].GetProperty("status").GetString());
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
