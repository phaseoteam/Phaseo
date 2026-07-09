using System.Net;
using System.Net.Http;
using System.Text;
using PhaseoSdk;
using Xunit;

namespace Phaseo.Sdk.Tests;

public class EndpointsTests
{
    [Fact]
    public async Task ListEndpointsReturnsPayload()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/endpoints")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"ok\":true,\"endpoints\":[\"chat/completions\",\"responses\",\"files\"],\"sample_models\":[\"openai/gpt-5-nano\"]}", Encoding.UTF8, "application/json")
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

        var response = await client.ListEndpoints();

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
