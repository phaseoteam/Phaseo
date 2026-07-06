using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using Xunit;

namespace Phaseo.Sdk.Tests;

public class ModelsTests
{
    [Fact]
    public async Task ListModelsPreservesAvailabilityReason()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/models")
            {
                Assert.Contains("availability=all", request.RequestUri.Query);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"ok\":true,\"availability_mode\":\"all\",\"models\":[{\"id\":\"openai/gpt-5-mini\",\"providers\":[{\"api_provider_id\":\"openai\",\"availability_status\":\"coming_soon\",\"availability_reason\":\"scheduled\"}]}]}", Encoding.UTF8, "application/json")
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

        var response = await client.ListModels(new Dictionary<string, string>
        {
            ["availability"] = "all",
        });

        Assert.NotNull(response);
        Assert.Equal("all", response!["availability_mode"]?.ToString());
        var models = Assert.IsType<JsonElement>(response["models"]);
        var model = models.EnumerateArray().Single();
        var provider = model.GetProperty("providers").EnumerateArray().Single();
        Assert.Equal("coming_soon", provider.GetProperty("availability_status").GetString());
        Assert.Equal("scheduled", provider.GetProperty("availability_reason").GetString());
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
