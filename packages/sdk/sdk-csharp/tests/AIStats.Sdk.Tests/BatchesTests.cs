using System.Net;
using System.Net.Http;
using System.Text;
using AiStatsSdk;
using Xunit;

namespace AIStats.Sdk.Tests;

public class BatchesTests
{
    [Fact]
    public async Task CreateBatchReturnsPayload()
    {
        var handler = new StubHttpHandler(async request =>
        {
            if (request.Method == HttpMethod.Post && request.RequestUri?.AbsolutePath == "/batches")
            {
                var payload = await request.Content!.ReadAsStringAsync();
                Assert.Contains("\"input_file_id\":\"file_123\"", payload, StringComparison.Ordinal);
                Assert.Contains("\"session_id\":\"session_cs_batch_1\"", payload, StringComparison.Ordinal);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"id\":\"batch_123\",\"status\":\"validating\",\"provider\":\"openai\",\"request_id\":\"req_cs_batch_1\",\"session_id\":\"session_cs_batch_1\",\"pricing_lines\":[{\"provider\":\"openai\",\"cost_usd\":0.03}]}", Encoding.UTF8, "application/json")
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

        var batch = await client.CreateBatch(new Dictionary<string, object>
        {
            ["input_file_id"] = "file_123",
            ["endpoint"] = "/v1/responses",
            ["completion_window"] = "24h",
            ["session_id"] = "session_cs_batch_1"
        });

        Assert.NotNull(batch);
        Assert.Equal("batch_123", batch!["id"]?.ToString());
        Assert.Equal("validating", batch["status"]?.ToString());
        Assert.Equal("openai", batch["provider"]?.ToString());
        Assert.Equal("req_cs_batch_1", batch["request_id"]?.ToString());
        Assert.Equal("session_cs_batch_1", batch["session_id"]?.ToString());
        Assert.NotNull(batch["pricing_lines"]);
    }

    [Fact]
    public async Task RetrieveBatchReturnsPayload()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/batches/batch_123")
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"id\":\"batch_123\",\"status\":\"completed\",\"provider\":\"openai\",\"request_id\":\"req_cs_batch_2\",\"session_id\":\"session_cs_batch_1\",\"request_counts\":{\"total\":4,\"completed\":3,\"failed\":1},\"billing\":{\"charged\":true,\"cost_usd\":0.12}}", Encoding.UTF8, "application/json")
                });
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("{\"error\":\"not found\"}", Encoding.UTF8, "application/json")
            });
        });

        using var httpClient = new HttpClient(handler);
        var client = new AiStatsSdk.AIStats(
            apiKey: "test",
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: httpClient);

        var batch = await client.RetrieveBatch("batch_123");

        Assert.NotNull(batch);
        Assert.Equal("batch_123", batch!["id"]?.ToString());
        Assert.Equal("completed", batch["status"]?.ToString());
        Assert.Equal("openai", batch["provider"]?.ToString());
        Assert.Equal("req_cs_batch_2", batch["request_id"]?.ToString());
        Assert.Equal("session_cs_batch_1", batch["session_id"]?.ToString());
        Assert.NotNull(batch["request_counts"]);
        Assert.NotNull(batch["billing"]);
    }

    [Fact]
    public async Task CancelBatchReturnsPayload()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Post && request.RequestUri?.AbsolutePath == "/batches/batch_123/cancel")
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"id\":\"batch_123\",\"status\":\"cancelling\"}", Encoding.UTF8, "application/json")
                });
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("{\"error\":\"not found\"}", Encoding.UTF8, "application/json")
            });
        });

        using var httpClient = new HttpClient(handler);
        var client = new AiStatsSdk.AIStats(
            apiKey: "test",
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: httpClient);

        var batch = await client.CancelBatch("batch_123");

        Assert.NotNull(batch);
        Assert.Equal("batch_123", batch!["id"]?.ToString());
        Assert.Equal("cancelling", batch["status"]?.ToString());
    }

    [Fact]
    public async Task CancelBatchSurfacesApiErrors()
    {
        var handler = new StubHttpHandler(_request =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("{\"error\":\"not found\"}", Encoding.UTF8, "application/json")
            }));

        using var httpClient = new HttpClient(handler);
        var client = new AiStatsSdk.AIStats(
            apiKey: "test",
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: httpClient);

        await Assert.ThrowsAsync<AiStats.Gen.ApiErrorException>(() => client.CancelBatch("batch_missing_123"));
    }

    [Fact]
    public void GetBatchWebSocketUrlBuildsExpectedUrl()
    {
        var client = new AiStatsSdk.AIStats(
            apiKey: "test",
            basePath: "https://api.phaseo.app/v1/",
            enableDeprecationWarnings: false);

        var url = client.GetBatchWebSocketUrl("batch_123", intervalMs: 1500, closeOnTerminal: false);

        Assert.Equal(
            "wss://api.phaseo.app/v1/async/batch/batch_123/ws?interval_ms=1500&close_on_terminal=false",
            url);
    }

    [Fact]
    public void GetAsyncJobWebSocketUrlBuildsExpectedUrl()
    {
        var client = new AiStatsSdk.AIStats(
            apiKey: "test",
            basePath: "https://api.phaseo.app/v1/",
            enableDeprecationWarnings: false);

        var url = client.GetAsyncJobWebSocketUrl("video", "video 123", intervalMs: 1500, closeOnTerminal: false);

        Assert.Equal(
            "wss://api.phaseo.app/v1/async/video/video%20123/ws?interval_ms=1500&close_on_terminal=false",
            url);
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
