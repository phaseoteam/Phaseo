using System.Net;
using System.Net.Http;
using System.Text;
using AiStatsSdk;
using Xunit;

namespace AIStats.Sdk.Tests;

public class DevtoolsTests
{
    [Fact]
    public async Task DevtoolsRecordsResponsesEntries()
    {
        var handler = new StubHttpHandler((request) =>
        {
            if (request.RequestUri?.AbsolutePath == "/responses")
            {
                return Json(HttpStatusCode.OK, """
                {
                  "id": "resp_1",
                  "model": "openai/gpt-5-nano",
                  "usage": {
                    "input_tokens": 2,
                    "output_tokens": 1,
                    "total_tokens": 3
                  }
                }
                """);
            }

            return Json(HttpStatusCode.NotFound, """{"error":"not found"}""");
        });

        var devtoolsDir = Path.Combine(Path.GetTempPath(), $"ai-stats-devtools-{Guid.NewGuid():N}");
        try
        {
            using var httpClient = new HttpClient(handler);
            var client = new AiStatsSdk.AIStats(
                apiKey: "test",
                basePath: "http://localhost",
                enableDeprecationWarnings: false,
                httpClient: httpClient,
                devtools: AIStatsDevtools.Create(directory: devtoolsDir, enabled: true));

            await client.CreateResponse(new Dictionary<string, object>
            {
                ["model"] = "openai/gpt-5-nano",
                ["input"] = "hi"
            });

            var generationsPath = Path.Combine(devtoolsDir, "generations.jsonl");
            var metadataPath = Path.Combine(devtoolsDir, "metadata.json");

            Assert.True(File.Exists(generationsPath), "generations.jsonl should exist");
            Assert.True(File.Exists(metadataPath), "metadata.json should exist");

            var content = File.ReadAllText(generationsPath);
            Assert.Contains("\"type\":\"responses\"", content, StringComparison.Ordinal);
            Assert.Contains("\"sdk\":\"csharp\"", content, StringComparison.Ordinal);
        }
        finally
        {
            if (Directory.Exists(devtoolsDir))
            {
                Directory.Delete(devtoolsDir, recursive: true);
            }
        }
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
