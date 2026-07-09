using System.Net;
using System.Net.Http;
using System.Text;
using PhaseoSdk;
using Xunit;

namespace Phaseo.Sdk.Tests;

public class OrganisationsTests
{
    [Fact]
    public async Task ListOrganisationsReturnsPayload()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/organisations")
            {
                Assert.Equal("2", request.RequestUri.Query.Contains("limit=2") ? "2" : null);
                Assert.Equal("3", request.RequestUri.Query.Contains("offset=3") ? "3" : null);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"ok\":true,\"limit\":2,\"offset\":3,\"total\":1,\"organisations\":[{\"organisation_id\":\"org_123\",\"name\":\"Anthropic\",\"country_code\":\"US\",\"colour\":\"#D97706\"}]}", Encoding.UTF8, "application/json")
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

        var response = await client.ListOrganisations(new Dictionary<string, string>
        {
            ["limit"] = "2",
            ["offset"] = "3",
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
