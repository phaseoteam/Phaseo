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
