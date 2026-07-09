using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using PhaseoSdk;
using Xunit;

namespace Phaseo.Sdk.Tests;

public class ProviderOpsTests
{
    [Fact]
    public async Task ProviderAndUsageHelpersReturnPayloads()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/providers")
            {
                Assert.Contains("limit=2", request.RequestUri.Query);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"ok\":true,\"providers\":[{\"provider_id\":\"openai\",\"name\":\"OpenAI\"}]}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/credits")
            {
                Assert.Contains("team_id=team_123", request.RequestUri.Query);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"ok\":true,\"credits\":{\"balance_usd\":42.5}}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/activity")
            {
                Assert.Contains("days=30", request.RequestUri.Query);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"ok\":true,\"total\":1,\"activity\":[{\"request_id\":\"req_123\"}]}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/analytics")
            {
                Assert.Contains("date=2026-05-01", request.RequestUri.Query);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"data\":[{\"date\":\"2026-05-01\",\"endpoint_id\":\"responses\",\"requests\":12}]}", Encoding.UTF8, "application/json")
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

        var providers = await client.ListProviders(new Dictionary<string, string> { ["limit"] = "2" });
        var credits = await client.GetCredits(new Dictionary<string, string> { ["team_id"] = "team_123" });
        var activity = await client.GetActivity(new Dictionary<string, string> { ["days"] = "30" });
        var analytics = await client.GetAnalytics(new Dictionary<string, string> { ["date"] = "2026-05-01" });

        Assert.NotNull(providers);
        Assert.NotNull(credits);
        Assert.NotNull(activity);
        Assert.NotNull(analytics);
        var providersData = Assert.IsType<JsonElement>(providers!["providers"]);
        Assert.Equal("openai", providersData[0].GetProperty("provider_id").GetString());
        var creditsData = Assert.IsType<JsonElement>(credits!["credits"]);
        Assert.Equal(42.5m, creditsData.GetProperty("balance_usd").GetDecimal());
        var activityData = Assert.IsType<JsonElement>(activity!["activity"]);
        Assert.Equal("req_123", activityData[0].GetProperty("request_id").GetString());
        var analyticsData = Assert.IsType<JsonElement>(analytics!["data"]);
        Assert.Equal("responses", analyticsData[0].GetProperty("endpoint_id").GetString());
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
