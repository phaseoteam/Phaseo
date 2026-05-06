using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
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
                  "request_id": "req_cs_1",
                  "session_id": "session_cs_chat_1",
                  "upstream_request_id": "upstream_cs_chat_1",
                  "pricing_lines": [
                    { "provider": "openai", "cost_usd": 0.0025 }
                  ],
                  "latency_ms": 120,
                  "generation_ms": 340,
                  "provider_attempts": [
                    { "provider": "openai", "status_code": 200, "duration_ms": 460 }
                  ],
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
            Assert.Contains("\"request_id\":\"req_cs_1\"", content, StringComparison.Ordinal);
            Assert.Contains("\"session_id\":\"session_cs_chat_1\"", content, StringComparison.Ordinal);
            Assert.Contains("\"upstream_request_id\":\"upstream_cs_chat_1\"", content, StringComparison.Ordinal);
            Assert.Contains("\"pricing_lines\"", content, StringComparison.Ordinal);
            Assert.Contains("\"provider_attempts\"", content, StringComparison.Ordinal);
        }
        finally
        {
            if (Directory.Exists(devtoolsDir))
            {
                Directory.Delete(devtoolsDir, recursive: true);
            }
        }
    }

    [Fact]
    public async Task DevtoolsRecordsStructuredErrorResponses()
    {
        var handler = new StubHttpHandler((request) =>
        {
            if (request.RequestUri?.AbsolutePath == "/responses")
            {
                return Json(HttpStatusCode.TooManyRequests, """
                {
                  "error": "rate limited",
                  "request_id": "req_cs_err_1",
                  "provider_attempts": [
                    { "provider": "openrouter", "status_code": 429, "duration_ms": 612 }
                  ]
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

            await Assert.ThrowsAsync<AiStats.Gen.ApiErrorException>(() => client.CreateResponse(new Dictionary<string, object>
            {
                ["model"] = "openai/gpt-5-nano",
                ["input"] = "hi"
            }));

            var content = File.ReadAllText(Path.Combine(devtoolsDir, "generations.jsonl"));
            Assert.Contains("\"request_id\":\"req_cs_err_1\"", content, StringComparison.Ordinal);
            Assert.Contains("\"status_code\":429", content, StringComparison.Ordinal);
            Assert.Contains("\"provider_attempts\"", content, StringComparison.Ordinal);
        }
        finally
        {
            if (Directory.Exists(devtoolsDir))
            {
                Directory.Delete(devtoolsDir, recursive: true);
            }
        }
    }

    [Fact]
    public async Task DevtoolsRecordsBatchEntries()
    {
        var handler = new StubHttpHandler((request) =>
        {
            if (request.RequestUri?.AbsolutePath == "/batches")
            {
                return Json(HttpStatusCode.OK, """
                {
                  "id": "batch_cs_1",
                  "object": "batch",
                  "status": "completed",
                  "endpoint": "/v1/responses",
                  "provider": "openai",
                  "request_id": "req_cs_batch_1",
                  "session_id": "session_cs_batch_1",
                  "pricing_lines": [
                    { "dimension": "batch_requests", "units": 2 }
                  ],
                  "request_counts": {
                    "total": 2,
                    "completed": 1,
                    "failed": 1
                  },
                  "billing": {
                    "charged": true,
                    "cost_usd": 0.0025
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

            await client.CreateBatch(new Dictionary<string, object>
            {
                ["input_file_id"] = "file_cs_1",
                ["endpoint"] = "/v1/responses",
                ["completion_window"] = "24h",
                ["session_id"] = "session_cs_batch_1",
                ["webhook"] = new Dictionary<string, object>
                {
                    ["url"] = "https://example.com/hooks/batch"
                }
            });

            var entry = JsonDocument.Parse(File.ReadAllText(Path.Combine(devtoolsDir, "generations.jsonl"))).RootElement;
            Assert.Equal("batches.create", entry.GetProperty("type").GetString());
            Assert.Equal("session_cs_batch_1", entry.GetProperty("request").GetProperty("session_id").GetString());
            Assert.Equal("https://example.com/hooks/batch", entry.GetProperty("request").GetProperty("webhook").GetProperty("url").GetString());
            Assert.Equal("openai", entry.GetProperty("metadata").GetProperty("provider").GetString());
            Assert.Equal("session_cs_batch_1", entry.GetProperty("metadata").GetProperty("session_id").GetString());
            Assert.Equal(2, entry.GetProperty("metadata").GetProperty("request_counts").GetProperty("total").GetInt32());
            Assert.True(entry.GetProperty("metadata").GetProperty("billing").GetProperty("charged").GetBoolean());
        }
        finally
        {
            if (Directory.Exists(devtoolsDir))
            {
                Directory.Delete(devtoolsDir, recursive: true);
            }
        }
    }

    [Fact]
    public async Task DevtoolsRecordsGenerationLookupEntries()
    {
        var handler = new StubHttpHandler((request) =>
        {
            if (request.RequestUri?.AbsolutePath == "/generations")
            {
                Assert.Equal(HttpMethod.Get, request.Method);
                Assert.Contains("id=gen_cs_1", request.RequestUri?.Query ?? string.Empty, StringComparison.Ordinal);
                return Json(HttpStatusCode.OK, """
                {
                  "id": "gen_cs_1",
                  "provider": "openai",
                  "request_id": "req_cs_generation_1",
                  "session_id": "session_cs_generation_1",
                  "status_code": 200
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

            await client.GetGeneration("gen_cs_1");

            var entry = JsonDocument.Parse(File.ReadAllText(Path.Combine(devtoolsDir, "generations.jsonl"))).RootElement;
            Assert.Equal("generations.retrieve", entry.GetProperty("type").GetString());
            Assert.Equal("gen_cs_1", entry.GetProperty("request").GetProperty("id").GetString());
            Assert.Equal("req_cs_generation_1", entry.GetProperty("metadata").GetProperty("request_id").GetString());
            Assert.Equal("session_cs_generation_1", entry.GetProperty("metadata").GetProperty("session_id").GetString());
            Assert.Equal("openai", entry.GetProperty("metadata").GetProperty("provider").GetString());
        }
        finally
        {
            if (Directory.Exists(devtoolsDir))
            {
                Directory.Delete(devtoolsDir, recursive: true);
            }
        }
    }

    [Fact]
    public async Task DevtoolsRecordsHealthEntries()
    {
        var handler = new StubHttpHandler((request) =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/health")
            {
                return Json(HttpStatusCode.OK, """
                {
                  "status": "ok",
                  "timestamp": "2026-05-05T12:00:00.000Z"
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

            var response = await client.Health();
            Assert.Equal("ok", response?["status"]?.ToString());

            var content = File.ReadAllText(Path.Combine(devtoolsDir, "generations.jsonl"));
            Assert.Contains("\"type\":\"health\"", content, StringComparison.Ordinal);
            Assert.Contains("\"status\":\"ok\"", content, StringComparison.Ordinal);
        }
        finally
        {
            if (Directory.Exists(devtoolsDir))
            {
                Directory.Delete(devtoolsDir, recursive: true);
            }
        }
    }

    [Fact]
    public async Task DevtoolsRecordsControlPlaneEntries()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/gateway/models")
            {
                Assert.Contains("limit=2", request.RequestUri.Query);
                return Json(HttpStatusCode.OK, """
                {
                  "models": [
                    { "model_id": "openai/gpt-5-mini" }
                  ]
                }
                """);
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/providers")
            {
                Assert.Contains("limit=2", request.RequestUri.Query);
                return Json(HttpStatusCode.OK, """
                {
                  "providers": [
                    { "provider_id": "openai", "name": "OpenAI" }
                  ]
                }
                """);
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/credits")
            {
                Assert.Contains("team_id=team_123", request.RequestUri.Query);
                return Json(HttpStatusCode.OK, """
                {
                  "credits": { "balance_usd": 42.5 }
                }
                """);
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/activity")
            {
                Assert.Contains("days=30", request.RequestUri.Query);
                return Json(HttpStatusCode.OK, """
                {
                  "ok": true,
                  "total": 1,
                  "activity": [
                    { "request_id": "req_cs_activity_1" }
                  ]
                }
                """);
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/analytics")
            {
                Assert.Contains("date=2026-05-01", request.RequestUri.Query);
                return Json(HttpStatusCode.OK, """
                {
                  "data": [
                    { "date": "2026-05-01", "endpoint_id": "responses", "requests": 12 }
                  ]
                }
                """);
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/endpoints")
            {
                return Json(HttpStatusCode.OK, """
                {
                  "data": [
                    { "id": "responses", "path": "/responses" }
                  ]
                }
                """);
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/organisations")
            {
                Assert.Contains("limit=2", request.RequestUri.Query);
                Assert.Contains("offset=3", request.RequestUri.Query);
                return Json(HttpStatusCode.OK, """
                {
                  "total": 1,
                  "organisations": [
                    { "organisation_id": "org_cs_1", "name": "Anthropic" }
                  ]
                }
                """);
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/pricing/models")
            {
                Assert.Contains("provider=openai", request.RequestUri.Query);
                return Json(HttpStatusCode.OK, """
                {
                  "models": [
                    { "provider": "openai", "model": "openai/gpt-5-mini" }
                  ]
                }
                """);
            }

            if (request.Method == HttpMethod.Post && request.RequestUri?.AbsolutePath == "/pricing/calculate")
            {
                return Json(HttpStatusCode.OK, """
                {
                  "pricing": {
                    "total_cost_usd": 0.00025,
                    "currency": "USD"
                  }
                }
                """);
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/keys")
            {
                Assert.Contains("disabled=true", request.RequestUri.Query);
                Assert.Contains("limit=2", request.RequestUri.Query);
                return Json(HttpStatusCode.OK, """
                {
                  "object": "list",
                  "data": [
                    { "id": "key_cs_1", "status": "active" }
                  ]
                }
                """);
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/key")
            {
                return Json(HttpStatusCode.OK, """
                {
                  "data": {
                    "id": "key_cs_1",
                    "status": "active"
                  }
                }
                """);
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/workspaces")
            {
                Assert.Contains("limit=2", request.RequestUri.Query);
                return Json(HttpStatusCode.OK, """
                {
                  "object": "list",
                  "data": [
                    { "id": "ws_cs_1" }
                  ]
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

            await client.ListModels(new Dictionary<string, string> { ["limit"] = "2" });
            await client.ListProviders(new Dictionary<string, string> { ["limit"] = "2" });
            await client.GetCredits(new Dictionary<string, string> { ["team_id"] = "team_123" });
            await client.GetActivity(new Dictionary<string, string> { ["days"] = "30" });
            await client.GetAnalytics(new Dictionary<string, string> { ["date"] = "2026-05-01" });
            await client.ListEndpoints();
            await client.ListOrganisations(new Dictionary<string, string> { ["limit"] = "2", ["offset"] = "3" });
            await client.ListPricingModels(new Dictionary<string, string> { ["provider"] = "openai" });
            await client.CalculatePricing(new Dictionary<string, object>
            {
                ["provider"] = "openai",
                ["model"] = "openai/gpt-5-mini",
                ["endpoint"] = "responses",
            });
            await client.ListApiKeys(new Dictionary<string, string> { ["disabled"] = "true", ["limit"] = "2" });
            await client.GetCurrentApiKey();
            await client.ListWorkspaces(new Dictionary<string, string> { ["limit"] = "2" });

            var lines = File.ReadAllLines(Path.Combine(devtoolsDir, "generations.jsonl"));
            Assert.Equal(12, lines.Length);

            var entries = lines.Select(line => JsonDocument.Parse(line).RootElement.Clone()).ToArray();
            var expectedTypes = new[]
            {
                "models.list",
                "providers",
                "credits",
                "activity",
                "analytics",
                "endpoints.list",
                "organisations.list",
                "pricing.models",
                "pricing.calculate",
                "provisioning.keys.list",
                "key.current",
                "provisioning.workspaces.list",
            };

            for (var i = 0; i < expectedTypes.Length; i++)
            {
                Assert.Equal(expectedTypes[i], entries[i].GetProperty("type").GetString());
            }

            Assert.Equal("2", entries[0].GetProperty("request").GetProperty("limit").ToString());
            Assert.Equal("responses", entries[4].GetProperty("response").GetProperty("data")[0].GetProperty("endpoint_id").GetString());
            Assert.Equal("USD", entries[8].GetProperty("response").GetProperty("pricing").GetProperty("currency").GetString());
            Assert.Equal("key_cs_1", entries[10].GetProperty("response").GetProperty("data").GetProperty("id").GetString());
            Assert.Equal("ws_cs_1", entries[11].GetProperty("response").GetProperty("data")[0].GetProperty("id").GetString());
        }
        finally
        {
            if (Directory.Exists(devtoolsDir))
            {
                Directory.Delete(devtoolsDir, recursive: true);
            }
        }
    }

    [Fact]
    public async Task DevtoolsRecordsVideoLifecycleEntries()
    {
        var handler = new StubHttpHandler((request) =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/data/models")
            {
                return Json(HttpStatusCode.OK, """
                {
                  "models": [
                    { "model_id": "google/veo-3", "status": "active" }
                  ]
                }
                """);
            }

            if (request.Method == HttpMethod.Post && request.RequestUri?.AbsolutePath == "/videos")
            {
                return Json(HttpStatusCode.OK, """
                {
                  "id": "video_cs_1",
                  "object": "video",
                  "status": "queued",
                  "provider": "google",
                  "model": "google/veo-3",
                  "request_id": "req_cs_video_1",
                  "session_id": "session_cs_video_1"
                }
                """);
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/videos/video_cs_1")
            {
                return Json(HttpStatusCode.OK, """
                {
                  "id": "video_cs_1",
                  "object": "video",
                  "status": "completed",
                  "provider": "google",
                  "model": "google/veo-3",
                  "request_id": "req_cs_video_2",
                  "session_id": "session_cs_video_2"
                }
                """);
            }

            if (request.Method == HttpMethod.Post && request.RequestUri?.AbsolutePath == "/videos/video_cs_1/cancel")
            {
                return Json(HttpStatusCode.OK, """
                {
                  "id": "video_cs_1",
                  "object": "video",
                  "status": "cancelled",
                  "provider": "google",
                  "model": "google/veo-3",
                  "request_id": "req_cs_video_3",
                  "session_id": "session_cs_video_3"
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

            await client.GenerateVideo(new Dictionary<string, object>
            {
                ["model"] = "google/veo-3",
                ["prompt"] = "orbital reveal"
            });
            await client.GetVideo("video_cs_1");
            await client.CancelVideo("video_cs_1");

            var lines = File.ReadAllLines(Path.Combine(devtoolsDir, "generations.jsonl"));
            Assert.Equal(3, lines.Length);

            var createEntry = JsonDocument.Parse(lines[0]).RootElement;
            Assert.Equal("video.generations", createEntry.GetProperty("type").GetString());
            Assert.Equal("google", createEntry.GetProperty("metadata").GetProperty("provider").GetString());
            Assert.Equal("req_cs_video_1", createEntry.GetProperty("metadata").GetProperty("request_id").GetString());

            var retrieveEntry = JsonDocument.Parse(lines[1]).RootElement;
            Assert.Equal("video.retrieve", retrieveEntry.GetProperty("type").GetString());
            Assert.Equal("video_cs_1", retrieveEntry.GetProperty("request").GetProperty("video_id").GetString());
            Assert.Equal("session_cs_video_2", retrieveEntry.GetProperty("metadata").GetProperty("session_id").GetString());

            var cancelEntry = JsonDocument.Parse(lines[2]).RootElement;
            Assert.Equal("video.cancel", cancelEntry.GetProperty("type").GetString());
            Assert.Equal("req_cs_video_3", cancelEntry.GetProperty("metadata").GetProperty("request_id").GetString());
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
