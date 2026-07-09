using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using PhaseoSdk;
using Xunit;

namespace Phaseo.Sdk.Tests;

public class ApiKeyTests
{
    [Fact]
    public async Task GetApiKeyReturnsPayload()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/keys/key_123")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"data\":{\"id\":\"key_123\",\"hash\":\"keyhash_123\",\"status\":\"active\"}}", Encoding.UTF8, "application/json")
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

        var response = await client.GetApiKey("key_123");

        Assert.NotNull(response);
        var data = Assert.IsType<JsonElement>(response!["data"]);
        Assert.Equal("key_123", data.GetProperty("id").GetString());
        Assert.Equal("keyhash_123", data.GetProperty("hash").GetString());
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
