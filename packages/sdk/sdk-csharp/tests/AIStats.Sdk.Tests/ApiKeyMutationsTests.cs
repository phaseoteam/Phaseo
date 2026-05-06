using System.Net;
using System.Net.Http;
using System.Text;
using AiStatsSdk;
using Xunit;

namespace AIStats.Sdk.Tests;

public class ApiKeyMutationsTests
{
    [Fact]
    public async Task ApiKeyMutationHelpersReturnPayloads()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Post && request.RequestUri?.AbsolutePath == "/keys")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"data\":{\"id\":\"key_123\",\"name\":\"Admin Key\",\"status\":\"active\"}}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Patch && request.RequestUri?.AbsolutePath == "/keys/key_123")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"data\":{\"id\":\"key_123\",\"name\":\"Renamed Key\",\"status\":\"disabled\"}}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Delete && request.RequestUri?.AbsolutePath == "/keys/key_123")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"data\":{\"id\":\"key_123\",\"deleted\":true}}", Encoding.UTF8, "application/json")
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

        var created = await client.CreateApiKey(new Dictionary<string, object>
        {
            ["name"] = "Admin Key",
            ["scopes"] = new[] { "gateway:read" },
        });
        var updated = await client.UpdateApiKey("key_123", new Dictionary<string, object>
        {
            ["name"] = "Renamed Key",
            ["disabled"] = true,
        });
        var deleted = await client.DeleteApiKey("key_123");

        Assert.NotNull(created);
        Assert.NotNull(updated);
        Assert.NotNull(deleted);
        Assert.Equal("active", created!["data"]?.ToString()?.Contains("active") == true ? "active" : null);
        Assert.Equal("disabled", updated!["data"]?.ToString()?.Contains("disabled") == true ? "disabled" : null);
        Assert.Contains("deleted", deleted!["data"]?.ToString());
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
