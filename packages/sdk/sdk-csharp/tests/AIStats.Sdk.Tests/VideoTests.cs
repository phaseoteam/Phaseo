using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using AiStatsSdk;
using Xunit;

namespace AIStats.Sdk.Tests;

public class VideoTests
{
    [Fact]
    public async Task RetrieveVideoContentReturnsBytes()
    {
        var handler = new StubHttpHandler((request) =>
        {
            if (request.RequestUri?.AbsolutePath == "/videos/video_123/content")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new ByteArrayContent(Encoding.UTF8.GetBytes("video-bytes"))
                };
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("{\"error\":\"not found\"}", Encoding.UTF8, "application/json")
            };
        });

        using var httpClient = new HttpClient(handler);
        var client = new AiStatsSdk.AIStats(
            apiKey: "test",
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: httpClient);

        var content = await client.RetrieveVideoContent("video_123");

        Assert.Equal("video-bytes", Encoding.UTF8.GetString(content));
    }

    [Fact]
    public async Task GetVideoDownloadUrlReturnsPayload()
    {
        var handler = new StubHttpHandler((request) =>
        {
            if (request.Method == HttpMethod.Post && request.RequestUri?.AbsolutePath == "/videos/video_123/download_url")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"download_url\":\"https://cdn.example.test/video.mp4\",\"expires_at\":1723000000}", Encoding.UTF8, "application/json")
                };
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("{\"error\":\"not found\"}", Encoding.UTF8, "application/json")
            };
        });

        using var httpClient = new HttpClient(handler);
        var client = new AiStatsSdk.AIStats(
            apiKey: "test",
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: httpClient);

        var response = await client.GetVideoDownloadUrl("video_123", new Dictionary<string, object>
        {
            ["disposition"] = "attachment"
        });

        Assert.NotNull(response);
        var downloadUrl = Assert.IsType<JsonElement>(response!["download_url"]);
        var expiresAt = Assert.IsType<JsonElement>(response["expires_at"]);
        Assert.Equal("https://cdn.example.test/video.mp4", downloadUrl.GetString());
        Assert.Equal(1723000000L, expiresAt.GetInt64());
    }

    [Fact]
    public async Task VideoLifecycleHelpersReturnPayloads()
    {
        var handler = new StubHttpHandler(request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/gateway/models")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"models\":[{\"model_id\":\"google/veo-3\",\"status\":\"active\"}]}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Post && request.RequestUri?.AbsolutePath == "/videos")
            {
                var payload = request.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
                Assert.Contains("\"model\":\"google/veo-3\"", payload, StringComparison.Ordinal);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"id\":\"video_123\",\"object\":\"video\",\"status\":\"queued\",\"provider\":\"google\",\"request_id\":\"req_cs_video_1\",\"session_id\":\"session_cs_video_1\",\"pricing_lines\":[{\"dimension\":\"video_seconds\",\"units\":8}]}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/videos/video_123")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"id\":\"video_123\",\"object\":\"video\",\"status\":\"completed\",\"provider\":\"google\",\"request_id\":\"req_cs_video_1\",\"session_id\":\"session_cs_video_1\",\"pricing_lines\":[{\"dimension\":\"video_seconds\",\"units\":8}]}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Post && request.RequestUri?.AbsolutePath == "/videos/video_123/cancel")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"id\":\"video_123\",\"object\":\"video\",\"status\":\"cancelled\"}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Delete && request.RequestUri?.AbsolutePath == "/videos/video_123")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"id\":\"video_123\",\"object\":\"video\",\"deleted\":true}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/videos/models")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"object\":\"list\",\"data\":[{\"id\":\"google/veo-3\"}]}", Encoding.UTF8, "application/json")
                };
            }

            if (request.Method == HttpMethod.Get && request.RequestUri?.AbsolutePath == "/videos")
            {
                Assert.Contains("status=queued%2Ccompleted", request.RequestUri?.Query ?? string.Empty, StringComparison.Ordinal);
                Assert.Contains("limit=2", request.RequestUri?.Query ?? string.Empty, StringComparison.Ordinal);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"object\":\"list\",\"data\":[{\"id\":\"video_123\",\"status\":\"queued\"},{\"id\":\"video_456\",\"status\":\"completed\"}]}", Encoding.UTF8, "application/json")
                };
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("{\"error\":\"not found\"}", Encoding.UTF8, "application/json")
            };
        });

        using var httpClient = new HttpClient(handler);
        var client = new AiStatsSdk.AIStats(
            apiKey: "test",
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: httpClient);

        var created = await client.GenerateVideo(new Dictionary<string, object>
        {
            ["model"] = "google/veo-3",
            ["prompt"] = "orbiting camera shot"
        });
        Assert.Equal("queued", created!["status"]?.ToString());
        Assert.Equal("google", created["provider"]?.ToString());
        Assert.Equal("req_cs_video_1", created["request_id"]?.ToString());
        Assert.Equal("session_cs_video_1", created["session_id"]?.ToString());
        Assert.Equal(JsonValueKind.Array, Assert.IsType<JsonElement>(created["pricing_lines"]).ValueKind);

        var retrieved = await client.GetVideo("video_123");
        Assert.Equal("completed", retrieved!["status"]?.ToString());
        Assert.Equal("google", retrieved["provider"]?.ToString());
        Assert.Equal("req_cs_video_1", retrieved["request_id"]?.ToString());
        Assert.Equal("session_cs_video_1", retrieved["session_id"]?.ToString());

        var cancelled = await client.CancelVideo("video_123");
        Assert.Equal("cancelled", cancelled!["status"]?.ToString());

        var deleted = await client.DeleteVideo("video_123");
        var deletedValue = Assert.IsType<JsonElement>(deleted!["deleted"]);
        Assert.True(deletedValue.GetBoolean());

        var models = await client.ListVideoModels();
        Assert.NotNull(models);
        var data = Assert.IsType<JsonElement>(models!["data"]);
        Assert.Equal(JsonValueKind.Array, data.ValueKind);
        Assert.Equal("google/veo-3", data[0].GetProperty("id").GetString());

        var list = await client.ListVideos(new Dictionary<string, string>
        {
            ["status"] = "queued,completed",
            ["limit"] = "2"
        });
        var listData = Assert.IsType<JsonElement>(list!["data"]);
        Assert.Equal(2, listData.GetArrayLength());
        Assert.Equal("video_456", listData[1].GetProperty("id").GetString());
    }

    [Fact]
    public void GetVideoWebSocketUrlBuildsExpectedUrl()
    {
        var client = new AiStatsSdk.AIStats(
            apiKey: "test",
            basePath: "http://localhost:8787/v1",
            enableDeprecationWarnings: false);

        var url = client.GetVideoWebSocketUrl("video_123", intervalMs: 900);

        Assert.Equal("ws://localhost:8787/v1/async/video/video_123/ws?interval_ms=900", url);
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
