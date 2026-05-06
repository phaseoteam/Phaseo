using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using AiStatsSdk;
using Xunit;

namespace AIStats.Sdk.Tests;

public class WorkspacesTests
{
    [Fact]
    public async Task ListWorkspacesReturnsPayload()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/workspaces")
            {
                Assert.Contains("limit=2", request.RequestUri.Query);
                Assert.Contains("offset=3", request.RequestUri.Query);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"object\":\"list\",\"data\":[{\"id\":\"ws_123\",\"slug\":\"default\"},{\"id\":\"ws_456\",\"slug\":\"sandbox\"}]}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/workspaces/ws_123")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"data\":{\"id\":\"ws_123\",\"slug\":\"default\",\"name\":\"Default Workspace\"}}", Encoding.UTF8, "application/json")
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

        var listed = await client.ListWorkspaces(new Dictionary<string, string>
        {
            ["limit"] = "2",
            ["offset"] = "3",
        });
        var retrieved = await client.GetWorkspace("ws_123");

        Assert.NotNull(listed);
        Assert.Equal("list", listed!["object"]?.ToString());
        var data = Assert.IsType<JsonElement>(retrieved!["data"]);
        Assert.Equal("ws_123", data.GetProperty("id").GetString());
        Assert.Equal("default", data.GetProperty("slug").GetString());
        Assert.Equal("Default Workspace", data.GetProperty("name").GetString());
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
