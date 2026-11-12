using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using PhaseoSdk;
using Xunit;

namespace Phaseo.Sdk.Tests;

public class CredentialProviderTests
{
    [Fact]
    public async Task ProviderIsCalledForEachRequest()
    {
        var authorizations = new List<string?>();
        var handler = new StubHttpHandler(request =>
        {
            authorizations.Add(Authorization(request));
            return Json(HttpStatusCode.OK, "{\"data\":{}}");
        });
        var calls = 0;
        var client = PhaseoSdk.Phaseo.FromApiKeyProvider(
            _ => ValueTask.FromResult($"  token-{++calls}  "),
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: new HttpClient(handler));

        await client.GetCurrentApiKey();
        await client.GetCurrentApiKey();

        Assert.Equal(new[] { "Bearer token-1", "Bearer token-2" }, authorizations);
    }

    [Fact]
    public async Task ProviderIsCalledAgainForRetries()
    {
        var authorizations = new List<string?>();
        var handler = new StubHttpHandler(request =>
        {
            authorizations.Add(Authorization(request));
            return authorizations.Count == 1
                ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable) { Headers = { { "Retry-After", "0" } } }
                : Json(HttpStatusCode.OK, "{\"data\":{}}");
        });
        var calls = 0;
        var client = PhaseoSdk.Phaseo.FromApiKeyProvider(
            _ => ValueTask.FromResult($"token-{++calls}"),
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: new HttpClient(handler));
        client.SetMaxRetries(1);

        await client.GetCurrentApiKey();

        Assert.Equal(new[] { "Bearer token-1", "Bearer token-2" }, authorizations);
    }

    [Fact]
    public async Task BlankCredentialFailsWithoutSendingTheRequest()
    {
        var sent = 0;
        var handler = new StubHttpHandler(_ =>
        {
            sent++;
            return Json(HttpStatusCode.OK, "{}");
        });
        var client = PhaseoSdk.Phaseo.FromApiKeyProvider(
            _ => ValueTask.FromResult("   "),
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: new HttpClient(handler));

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => client.GetCurrentApiKey());

        Assert.Contains("empty credential", error.Message);
        Assert.Equal(0, sent);
    }

    [Fact]
    public async Task ProviderErrorsPropagateWithoutSendingTheRequest()
    {
        var sent = 0;
        var handler = new StubHttpHandler(_ =>
        {
            sent++;
            return Json(HttpStatusCode.OK, "{}");
        });
        var client = PhaseoSdk.Phaseo.FromApiKeyProvider(
            _ => throw new TimeoutException("token service down"),
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: new HttpClient(handler));

        await Assert.ThrowsAsync<TimeoutException>(() => client.GetCurrentApiKey());
        Assert.Equal(0, sent);
    }

    [Fact]
    public async Task PerRequestAuthorizationWinsAndProviderIsNotCalled()
    {
        var authorizations = new List<string?>();
        var handler = new StubHttpHandler(request =>
        {
            authorizations.Add(Authorization(request));
            return Json(HttpStatusCode.OK, "{}");
        });
        var calls = 0;
        var client = PhaseoSdk.Phaseo.FromApiKeyProvider(
            _ => ValueTask.FromResult($"token-{++calls}"),
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: new HttpClient(handler));

        await client.RequestWithResponse("GET", "/key", headers: new Dictionary<string, string> { ["Authorization"] = "Bearer explicit" });

        Assert.Equal(new[] { "Bearer explicit" }, authorizations);
        Assert.Equal(0, calls);
    }

    [Fact]
    public async Task StaticKeyStillSendsTheSameHeader()
    {
        var authorizations = new List<string?>();
        var handler = new StubHttpHandler(request =>
        {
            authorizations.Add(Authorization(request));
            return Json(HttpStatusCode.OK, "{\"data\":{}}");
        });
        var client = new PhaseoSdk.Phaseo(
            apiKey: "static-key",
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: new HttpClient(handler));

        await client.GetCurrentApiKey();

        Assert.Equal(new[] { "Bearer static-key" }, authorizations);
    }

    [Fact]
    public void NullKeyConstructorStillCompiles()
    {
        // `new Phaseo(null, basePath)` falls back to PHASEO_API_KEY; a provider constructor overload would make it ambiguous.
        Func<PhaseoSdk.Phaseo> fromEnvironment = () => new PhaseoSdk.Phaseo(null, "http://localhost");
        Assert.NotNull(fromEnvironment);
    }

    [Fact]
    public async Task GitHubActionsFetchesWithAudienceAndCachesUntilNearExpiry()
    {
        var clock = new ManualClock(DateTimeOffset.FromUnixTimeSeconds(1_800_000_000));
        var token = Jwt(1_800_000_000 + 600);
        var requests = new List<(string Url, string? Authorization)>();
        var handler = new StubHttpHandler(request =>
        {
            requests.Add((request.RequestUri!.ToString(), Authorization(request)));
            return Json(HttpStatusCode.OK, JsonSerializer.Serialize(new { value = token }));
        });
        var env = new Dictionary<string, string>
        {
            ["ACTIONS_ID_TOKEN_REQUEST_URL"] = "https://token.actions.test/oidc?api-version=2.0",
            ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"] = "request-token"
        };
        var provider = WorkloadTokens.GitHubActions(
            httpClient: new HttpClient(handler),
            environment: name => env.GetValueOrDefault(name),
            timeProvider: clock);

        Assert.Equal(token, await provider(CancellationToken.None));
        clock.Now = clock.Now.AddSeconds(500);
        Assert.Equal(token, await provider(CancellationToken.None));
        Assert.Single(requests);
        Assert.Equal("https://token.actions.test/oidc?api-version=2.0&audience=https%3A%2F%2Fapi.phaseo.app", requests[0].Url);
        Assert.Equal("bearer request-token", requests[0].Authorization);

        clock.Now = clock.Now.AddSeconds(50);
        await provider(CancellationToken.None);
        Assert.Equal(2, requests.Count);
    }

    [Fact]
    public async Task GitHubActionsDoesNotCacheTokensWithoutExpiry()
    {
        var calls = 0;
        var handler = new StubHttpHandler(_ =>
        {
            calls++;
            return Json(HttpStatusCode.OK, "{\"value\":\"opaque-token\"}");
        });
        var env = new Dictionary<string, string>
        {
            ["ACTIONS_ID_TOKEN_REQUEST_URL"] = "https://token.actions.test/oidc",
            ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"] = "request-token"
        };
        var provider = WorkloadTokens.GitHubActions(
            audience: "custom",
            httpClient: new HttpClient(new StubHttpHandler(request =>
            {
                Assert.Equal("https://token.actions.test/oidc?audience=custom", request.RequestUri!.ToString());
                return handler.Handle(request);
            })),
            environment: name => env.GetValueOrDefault(name));

        Assert.Equal("opaque-token", await provider(CancellationToken.None));
        Assert.Equal("opaque-token", await provider(CancellationToken.None));
        Assert.Equal(2, calls);
    }

    [Fact]
    public async Task GitHubActionsWithoutEnvironmentExplainsThePermission()
    {
        var provider = WorkloadTokens.GitHubActions(environment: _ => null);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(async () => await provider(CancellationToken.None));

        Assert.Contains("id-token: write", error.Message);
    }

    [Fact]
    public async Task GitHubActionsErrorIncludesStatusButNotTokens()
    {
        var handler = new StubHttpHandler(_ => Json(HttpStatusCode.Forbidden, "{\"message\":\"nope\"}"));
        var provider = WorkloadTokens.GitHubActions(
            httpClient: new HttpClient(handler),
            environment: name => name == "ACTIONS_ID_TOKEN_REQUEST_URL" ? "https://token.actions.test/oidc" : "secret-request-token");

        var error = await Assert.ThrowsAsync<InvalidOperationException>(async () => await provider(CancellationToken.None));

        Assert.Contains("403", error.Message);
        Assert.DoesNotContain("secret-request-token", error.Message);
    }

    [Fact]
    public async Task VercelExchangesTheFileTokenAndCachesUntilNearExpiry()
    {
        var clock = new ManualClock(DateTimeOffset.FromUnixTimeSeconds(1_800_000_000));
        var file = Path.GetTempFileName();
        try
        {
            await File.WriteAllTextAsync(file, "  vercel-source  \n");
            var bodies = new List<string>();
            var handler = new StubHttpHandler(request =>
            {
                Assert.Equal(HttpMethod.Post, request.Method);
                Assert.Equal("https://oidc.vercel.com/~token", request.RequestUri!.ToString());
                Assert.Equal("application/json", request.Content!.Headers.ContentType!.MediaType);
                Assert.Contains("application/json", request.Headers.Accept.ToString());
                bodies.Add(request.Content.ReadAsStringAsync().GetAwaiter().GetResult());
                return Json(HttpStatusCode.OK, "{\"token\":\"exchanged\",\"expiry\":1800000300}");
            });
            var provider = WorkloadTokens.Vercel(
                httpClient: new HttpClient(handler),
                environment: name => name == "VERCEL_OIDC_TOKEN_FILE" ? file : "env-source",
                timeProvider: clock);

            Assert.Equal("exchanged", await provider(CancellationToken.None));
            clock.Now = clock.Now.AddSeconds(200);
            Assert.Equal("exchanged", await provider(CancellationToken.None));
            Assert.Single(bodies);
            using (var body = JsonDocument.Parse(bodies[0]))
            {
                Assert.Equal("vercel-source", body.RootElement.GetProperty("token").GetString());
                Assert.Equal("https://api.phaseo.app", body.RootElement.GetProperty("aud").GetString());
            }

            clock.Now = clock.Now.AddSeconds(41);
            await provider(CancellationToken.None);
            Assert.Equal(2, bodies.Count);
        }
        finally
        {
            File.Delete(file);
        }
    }

    [Fact]
    public async Task VercelUsesEnvironmentTokenAndSourceProviderAndRefetchesForNewSource()
    {
        var sources = new List<string>();
        var handler = new StubHttpHandler(request =>
        {
            using var body = JsonDocument.Parse(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult());
            sources.Add(body.RootElement.GetProperty("token").GetString()!);
            Assert.Equal("custom-aud", body.RootElement.GetProperty("aud").GetString());
            return Json(HttpStatusCode.OK, JsonSerializer.Serialize(new { token = Jwt(DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 3600) }));
        });

        var fromEnv = WorkloadTokens.Vercel(
            audience: "custom-aud",
            httpClient: new HttpClient(handler),
            environment: name => name == "VERCEL_OIDC_TOKEN" ? "env-source" : null);
        await fromEnv(CancellationToken.None);

        var header = "request-a";
        var fromHeader = WorkloadTokens.Vercel(
            audience: "custom-aud",
            sourceTokenProvider: _ => ValueTask.FromResult(header),
            httpClient: new HttpClient(handler),
            environment: _ => null);
        await fromHeader(CancellationToken.None);
        await fromHeader(CancellationToken.None);
        header = "request-b";
        await fromHeader(CancellationToken.None);

        Assert.Equal(new[] { "env-source", "request-a", "request-b" }, sources);
    }

    [Fact]
    public async Task VercelSurfacesTheErrorMessage()
    {
        var handler = new StubHttpHandler(_ => Json(HttpStatusCode.BadRequest, "{\"error\":\"invalid audience\"}"));
        var provider = WorkloadTokens.Vercel(sourceToken: "source", httpClient: new HttpClient(handler), environment: _ => null);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(async () => await provider(CancellationToken.None));

        Assert.Contains("invalid audience", error.Message);
        Assert.Contains("400", error.Message);
    }

    [Fact]
    public async Task VercelWithoutSourceTokenFails()
    {
        var provider = WorkloadTokens.Vercel(environment: _ => null);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(async () => await provider(CancellationToken.None));

        Assert.Contains("VERCEL_OIDC_TOKEN", error.Message);
    }

    [Fact]
    public async Task WorkloadTokenProviderAuthenticatesClientRequests()
    {
        var authorizations = new List<string?>();
        var token = Jwt(DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 3600);
        var handler = new StubHttpHandler(request =>
        {
            if (request.RequestUri!.Host == "token.actions.test")
            {
                return Json(HttpStatusCode.OK, JsonSerializer.Serialize(new { value = token }));
            }

            authorizations.Add(Authorization(request));
            return Json(HttpStatusCode.OK, "{\"data\":{}}");
        });
        var httpClient = new HttpClient(handler);
        var client = PhaseoSdk.Phaseo.FromApiKeyProvider(
            WorkloadTokens.GitHubActions(
                httpClient: httpClient,
                environment: name => name == "ACTIONS_ID_TOKEN_REQUEST_URL" ? "https://token.actions.test/oidc" : "request-token"),
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: httpClient);

        await client.GetCurrentApiKey();

        Assert.Equal(new[] { "Bearer " + token }, authorizations);
    }

    private static string? Authorization(HttpRequestMessage request) =>
        request.Headers.TryGetValues("Authorization", out var values) ? string.Join(",", values) : null;

    private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static string Jwt(long exp)
    {
        static string Encode(string value) => Convert.ToBase64String(Encoding.UTF8.GetBytes(value)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return Encode("{\"alg\":\"none\"}") + "." + Encode("{\"exp\":" + exp + ",\"sub\":\"repo:phaseo/test\"}") + ".sig";
    }

    private sealed class ManualClock : TimeProvider
    {
        public ManualClock(DateTimeOffset now) => Now = now;
        public DateTimeOffset Now { get; set; }
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class StubHttpHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

        public StubHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        {
            _handler = handler;
        }

        public HttpResponseMessage Handle(HttpRequestMessage request) => _handler(request);

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(_handler(request));
        }
    }
}
