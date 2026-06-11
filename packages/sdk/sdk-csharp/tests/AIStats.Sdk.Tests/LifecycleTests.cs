using System.Net;
using System.Net.Http;
using System.Text;
using AiStatsSdk;
using Xunit;

namespace AIStats.Sdk.Tests;

public class LifecycleTests
{
    [Fact]
    public async Task DeprecatedModelBlocksRequest()
    {
        var warnings = new List<string>();
        var handler = new StubHttpHandler((request) =>
        {
            if (request.RequestUri?.AbsolutePath == "/gateway/models")
            {
                return Json(HttpStatusCode.OK, """
                {
                  "models": [
                    {
                      "model_id": "provider/old-model",
                      "lifecycle": {
                        "status": "deprecated",
                        "retirement_date": "2099-01-01T00:00:00Z",
                        "replacement_model_id": "provider/new-model"
                      }
                    }
                  ]
                }
                """);
            }

            if (request.RequestUri?.AbsolutePath == "/responses")
            {
                return Json(HttpStatusCode.OK, """{"id":"resp_1","model":"provider/old-model"}""");
            }

            return Json(HttpStatusCode.NotFound, """{"error":"not found"}""");
        });

        using var httpClient = new HttpClient(handler);
        var client = new AiStatsSdk.AIStats(
            apiKey: "test",
            basePath: "http://localhost",
            logger: (level, message, _) =>
            {
                if (level == "warn")
                {
                    warnings.Add(message);
                }
            },
            httpClient: httpClient);

        var payload = new Dictionary<string, object>
        {
            ["model"] = "provider/old-model",
            ["input"] = "Hello"
        };
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => client.CreateResponse(payload));

        Assert.Contains("provider/new-model", ex.Message);
        Assert.Empty(warnings);
        Assert.Equal(1, handler.Count("/gateway/models"));
        Assert.Equal(0, handler.Count("/responses"));
    }

    [Fact]
    public async Task RetiredModelBlocksRequestWithoutWarningsAsErrors()
    {
        var handler = new StubHttpHandler((request) =>
        {
            if (request.RequestUri?.AbsolutePath == "/gateway/models")
            {
                return Json(HttpStatusCode.OK, """
                {
                  "models": [
                    {
                      "model_id": "provider/retired-model",
                      "lifecycle": {
                        "status": "retired",
                        "retirement_date": "2020-01-01T00:00:00Z"
                      }
                    }
                  ]
                }
                """);
            }

            if (request.RequestUri?.AbsolutePath == "/responses")
            {
                return Json(HttpStatusCode.OK, """{"id":"resp_1"}""");
            }

            return Json(HttpStatusCode.NotFound, """{"error":"not found"}""");
        });

        using var httpClient = new HttpClient(handler);
        var client = new AiStatsSdk.AIStats(
            apiKey: "test",
            basePath: "http://localhost",
            warningsAsErrors: false,
            httpClient: httpClient);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            client.CreateResponse(new Dictionary<string, object>
            {
                ["model"] = "provider/retired-model",
                ["input"] = "Hello"
            }));

        Assert.Contains("retired", ex.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(0, handler.Count("/responses"));
    }

    private static HttpResponseMessage Json(HttpStatusCode statusCode, string payload)
    {
        return new HttpResponseMessage(statusCode)
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };
    }

    private sealed class StubHttpHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;
        private readonly Dictionary<string, int> _calls = new(StringComparer.Ordinal);

        public StubHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        {
            _handler = handler;
        }

        public int Count(string path)
        {
            return _calls.TryGetValue(path, out var count) ? count : 0;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri?.AbsolutePath ?? string.Empty;
            _calls[path] = Count(path) + 1;
            return Task.FromResult(_handler(request));
        }
    }
}
