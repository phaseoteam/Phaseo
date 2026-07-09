using System.Net;
using System.Net.Http;
using System.Text;
using PhaseoSdk;
using Xunit;

namespace Phaseo.Sdk.Tests;

public class PricingModelsTests
{
    [Fact]
    public async Task ListPricingModelsReturnsPayload()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/pricing/models")
            {
                Assert.Contains("provider=openai", request.RequestUri.Query);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"ok\":true,\"models\":[{\"provider\":\"openai\",\"model\":\"openai/gpt-5-mini\",\"endpoint\":\"responses\",\"display_name\":\"GPT-5 Mini\",\"meters\":[{\"meter\":\"input_tokens\",\"unit\":\"tokens\",\"unit_size\":1000,\"price_per_unit\":\"0.00025\",\"currency\":\"USD\"}]}]}", Encoding.UTF8, "application/json")
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

        var response = await client.ListPricingModels(new Dictionary<string, string>
        {
            ["provider"] = "openai",
        });

        Assert.NotNull(response);
        Assert.Equal("True", response!["ok"]?.ToString());
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
