using System.Net;
using System.Net.Http;
using System.Text;
using AiStatsSdk;
using Xunit;

namespace AIStats.Sdk.Tests;

public class WorkspaceMutationsTests
{
    [Fact]
    public async Task WorkspaceMutationHelpersReturnPayloads()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Post && request.RequestUri?.AbsolutePath == "/workspaces")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"data\":{\"id\":\"ws_123\",\"slug\":\"sandbox\",\"name\":\"Sandbox Workspace\"}}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Patch && request.RequestUri?.AbsolutePath == "/workspaces/ws_123")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"data\":{\"id\":\"ws_123\",\"slug\":\"sandbox\",\"name\":\"Renamed Workspace\",\"archived\":true}}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Delete && request.RequestUri?.AbsolutePath == "/workspaces/ws_123")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"data\":{\"id\":\"ws_123\",\"deleted\":true}}", Encoding.UTF8, "application/json")
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

        var created = await client.CreateWorkspace(new Dictionary<string, object>
        {
            ["name"] = "Sandbox Workspace",
            ["slug"] = "sandbox",
        });
        var updated = await client.UpdateWorkspace("ws_123", new Dictionary<string, object>
        {
            ["name"] = "Renamed Workspace",
            ["archived"] = true,
        });
        var deleted = await client.DeleteWorkspace("ws_123");

        Assert.NotNull(created);
        Assert.NotNull(updated);
        Assert.NotNull(deleted);
        Assert.Equal("sandbox", created!["data"]?.ToString()?.Contains("sandbox") == true ? "sandbox" : null);
        Assert.Equal("true", updated!["data"]?.ToString()?.Contains("archived") == true ? "true" : null);
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
