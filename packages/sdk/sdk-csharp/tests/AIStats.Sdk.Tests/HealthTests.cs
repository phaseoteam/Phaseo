using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using Xunit;

namespace AIStats.Sdk.Tests;

public class HealthTests
{
    [Fact]
    public async Task HealthReturnsPayload()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/health")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"status\":\"ok\",\"timestamp\":\"2026-05-05T12:00:00.000Z\"}", Encoding.UTF8, "application/json")
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

        var response = await client.Health();

        Assert.NotNull(response);
        Assert.Equal("ok", response!["status"]?.ToString());
        Assert.Equal("2026-05-05T12:00:00.000Z", response["timestamp"]?.ToString());
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
