using System.Net;
using System.Net.Http;
using PhaseoSdk;
using Xunit;

namespace Phaseo.Sdk.Tests;

public class CoreContractTests
{
    [Fact]
    public async Task RetriesSafeReadsAndPreservesMetadataWithoutRetryingWrites()
    {
        var handler = new ContractHandler();
        var client = new PhaseoSdk.Phaseo("test", "https://example.test", httpClient: new HttpClient(handler))
            .SetTimeout(TimeSpan.FromSeconds(2))
            .SetMaxRetries(2);
        var retryCount = 0;
        client.SetRequestHooks(null, null, _ => retryCount++);

        var response = await client.RequestWithResponse("GET", "/read");
        Assert.Equal(2, handler.Reads);
        Assert.Equal(1, retryCount);
        Assert.Equal("req_csharp_core", response.RequestId);
        Assert.NotNull(response.TraceUrl);

        var text = await client.RawClient.SendTextAsync("GET", "/text");
        Assert.Equal("id,value\n1,ok", text);
        Assert.Equal(2, handler.TextReads);

        var bytes = await client.RawClient.SendBytesAsync("GET", "/bytes");
        Assert.Equal(new byte[] { 1, 2, 3 }, bytes);
        Assert.Equal(2, handler.ByteReads);

        var lines = new List<string>();
        await foreach (var line in client.RawClient.StreamLinesAsync("GET", "/stream"))
        {
            lines.Add(line);
        }
        Assert.Equal(new[] { "data: one", "data: two" }, lines);
        Assert.Equal(2, handler.StreamReads);
        Assert.Equal(4, retryCount);

        var error = await Assert.ThrowsAsync<global::Phaseo.Gen.ApiErrorException>(() =>
            client.RequestWithResponse(
                "POST",
                "/write",
                body: new Dictionary<string, object> { ["model"] = "test" },
                options: new global::Phaseo.Gen.RequestOptions { IdempotencyKey = "idem_csharp" }));
        Assert.Equal(1, handler.Writes);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (HttpStatusCode)error.StatusCode);
        Assert.Equal("temporarily_unavailable", error.Code);
        Assert.Equal("req_csharp_error", error.RequestId);
    }

    private sealed class ContractHandler : HttpMessageHandler
    {
        public int Reads { get; private set; }
        public int Writes { get; private set; }
        public int TextReads { get; private set; }
        public int ByteReads { get; private set; }
        public int StreamReads { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.RequestUri!.AbsolutePath == "/read")
            {
                Reads++;
                if (Reads == 1)
                {
                    var retry = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
                    retry.Headers.TryAddWithoutValidation("Retry-After", "0");
                    return Task.FromResult(retry);
                }
                var ok = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"ok\":true}") };
                ok.Headers.TryAddWithoutValidation("X-Request-Id", "req_csharp_core");
                return Task.FromResult(ok);
            }

            if (request.RequestUri.AbsolutePath == "/text")
            {
                TextReads++;
                return Task.FromResult(TextReads == 1
                    ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
                    : new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("id,value\n1,ok") });
            }

            if (request.RequestUri.AbsolutePath == "/bytes")
            {
                ByteReads++;
                return Task.FromResult(ByteReads == 1
                    ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
                    : new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(new byte[] { 1, 2, 3 }) });
            }

            if (request.RequestUri.AbsolutePath == "/stream")
            {
                StreamReads++;
                return Task.FromResult(StreamReads == 1
                    ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
                    : new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("data: one\ndata: two\n") });
            }

            Writes++;
            Assert.Equal("idem_csharp", request.Headers.GetValues("Idempotency-Key").Single());
            var error = new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
            {
                Content = new StringContent("{\"error\":{\"code\":\"temporarily_unavailable\"}}")
            };
            error.Headers.TryAddWithoutValidation("X-Request-Id", "req_csharp_error");
            return Task.FromResult(error);
        }
    }
}
