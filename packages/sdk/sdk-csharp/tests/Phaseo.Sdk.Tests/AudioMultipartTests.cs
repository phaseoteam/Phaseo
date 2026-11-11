using System.Net;
using System.Net.Http;
using System.Text;
using PhaseoSdk;
using Xunit;

namespace Phaseo.Sdk.Tests;

public class AudioMultipartTests
{
    private sealed record Part(string Name, string? FileName, string? ContentType, string Body);

    private sealed record Captured(string Method, string PathAndQuery, string? MediaType, string Body, List<Part> Parts);

    private static (PhaseoSdk.Phaseo Client, List<Captured> Requests, HttpClient Http) CreateClient()
    {
        var requests = new List<Captured>();
        var handler = new StubHttpHandler(async request =>
        {
            if (request.Method == HttpMethod.Get && request.RequestUri!.AbsolutePath == "/models")
            {
                // Model lifecycle lookup made before inference calls; not part of these assertions.
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"models\":[]}", Encoding.UTF8, "application/json")
                };
            }
            var body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync();
            var mediaType = request.Content?.Headers.ContentType?.MediaType;
            var boundary = request.Content?.Headers.ContentType?.Parameters.FirstOrDefault(p => p.Name == "boundary")?.Value?.Trim('"');
            requests.Add(new Captured(
                request.Method.Method,
                request.RequestUri!.PathAndQuery,
                mediaType,
                body,
                mediaType == "multipart/form-data" && boundary is not null ? ParseMultipart(body, boundary) : new List<Part>()));
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"text\":\"hello\",\"id\":\"file_123\"}", Encoding.UTF8, "application/json")
            };
        });
        var http = new HttpClient(handler);
        var client = new PhaseoSdk.Phaseo(apiKey: "test", basePath: "http://localhost", enableDeprecationWarnings: false, httpClient: http);
        return (client, requests, http);
    }

    private static List<Part> ParseMultipart(string body, string boundary)
    {
        var parts = new List<Part>();
        foreach (var chunk in body.Split("--" + boundary))
        {
            var trimmed = chunk.TrimStart('\r', '\n');
            if (trimmed.Length == 0 || trimmed.StartsWith("--")) continue;
            var split = trimmed.IndexOf("\r\n\r\n", StringComparison.Ordinal);
            var headers = trimmed[..split];
            var content = trimmed[(split + 4)..];
            if (content.EndsWith("\r\n")) content = content[..^2];
            string? name = null, fileName = null, contentType = null;
            foreach (var line in headers.Split("\r\n"))
            {
                if (line.StartsWith("Content-Disposition:", StringComparison.OrdinalIgnoreCase))
                {
                    name = Param(line, "name");
                    fileName = Param(line, "filename");
                }
                else if (line.StartsWith("Content-Type:", StringComparison.OrdinalIgnoreCase))
                {
                    contentType = line["Content-Type:".Length..].Trim();
                }
            }
            parts.Add(new Part(name ?? string.Empty, fileName, contentType, content));
        }
        return parts;
    }

    private static string? Param(string header, string key)
    {
        var marker = "; " + key + "=\"";
        var start = header.IndexOf(marker, StringComparison.Ordinal);
        if (start < 0) return null;
        start += marker.Length;
        var end = header.IndexOf('"', start);
        return header[start..end];
    }

    private static Part Field(Captured request, string name) => Assert.Single(request.Parts, p => p.Name == name);

    [Fact]
    public async Task TranscriptionWithFileSendsMultipart()
    {
        var (client, requests, http) = CreateClient();
        using var _ = http;

        await client.CreateTranscription(
            PhaseoFile.FromBytes(Encoding.ASCII.GetBytes("RIFFfakeaudio"), "clip.mp3"),
            new Dictionary<string, object>
            {
                ["model"] = "openai/gpt-4o-transcribe",
                ["language"] = "en",
                ["temperature"] = 0.2,
                ["stream"] = false,
                ["timestamp_granularities"] = new[] { "word", "segment" },
                ["provider"] = new Dictionary<string, object> { ["order"] = new[] { "openai" } },
            });

        var request = Assert.Single(requests);
        Assert.Equal("POST", request.Method);
        Assert.Equal("/audio/transcriptions", request.PathAndQuery);
        Assert.Equal("multipart/form-data", request.MediaType);
        var file = Field(request, "file");
        Assert.Equal("clip.mp3", file.FileName);
        Assert.Equal("audio/mpeg", file.ContentType);
        Assert.Equal("RIFFfakeaudio", file.Body);
        Assert.Equal("openai/gpt-4o-transcribe", Field(request, "model").Body);
        Assert.Equal("en", Field(request, "language").Body);
        Assert.Equal("0.2", Field(request, "temperature").Body);
        Assert.Equal("false", Field(request, "stream").Body);
        Assert.Equal("[\"word\",\"segment\"]", Field(request, "timestamp_granularities").Body);
        Assert.Equal("{\"order\":[\"openai\"]}", Field(request, "provider").Body);
    }

    [Fact]
    public async Task TranscriptionDictionaryWithLocalPathSendsMultipart()
    {
        var (client, requests, http) = CreateClient();
        using var _ = http;
        var dir = Directory.CreateTempSubdirectory("phaseo-audio-");
        var path = Path.Combine(dir.FullName, "speech.wav");
        await File.WriteAllTextAsync(path, "wavdata");
        try
        {
            var response = await client.CreateTranscription(new Dictionary<string, object>
            {
                ["model"] = "openai/whisper-1",
                ["file"] = path,
            });

            Assert.Equal("hello", response!["text"]?.ToString());
            var request = Assert.Single(requests);
            Assert.Equal("multipart/form-data", request.MediaType);
            var file = Field(request, "file");
            Assert.Equal("speech.wav", file.FileName);
            Assert.Equal("wavdata", file.Body);
            Assert.Equal("openai/whisper-1", Field(request, "model").Body);
        }
        finally
        {
            dir.Delete(true);
        }
    }

    [Fact]
    public async Task TranscriptionWithFileUrlOnlyStaysJson()
    {
        var (client, requests, http) = CreateClient();
        using var _ = http;

        await client.CreateTranscription(new Dictionary<string, object>
        {
            ["model"] = "openai/whisper-1",
            ["file_url"] = "https://example.com/audio.mp3",
        });

        var request = Assert.Single(requests);
        Assert.Equal("/audio/transcriptions", request.PathAndQuery);
        Assert.Equal("application/json", request.MediaType);
        Assert.Contains("\"file_url\":\"https://example.com/audio.mp3\"", request.Body);
        Assert.Contains("\"model\":\"openai/whisper-1\"", request.Body);
    }

    [Fact]
    public async Task TranslationWithBytesSendsMultipart()
    {
        var (client, requests, http) = CreateClient();
        using var _ = http;

        await client.CreateTranslation(new Dictionary<string, object>
        {
            ["model"] = "openai/whisper-1",
            ["file"] = Encoding.ASCII.GetBytes("oggdata"),
            ["filename"] = "voice.ogg",
            ["prompt"] = "Bonjour",
        });

        var request = Assert.Single(requests);
        Assert.Equal("/audio/translations", request.PathAndQuery);
        Assert.Equal("multipart/form-data", request.MediaType);
        var file = Field(request, "file");
        Assert.Equal("voice.ogg", file.FileName);
        Assert.Equal("audio/ogg", file.ContentType);
        Assert.Equal("oggdata", file.Body);
        Assert.Equal("openai/whisper-1", Field(request, "model").Body);
        Assert.Equal("Bonjour", Field(request, "prompt").Body);
        Assert.DoesNotContain(request.Parts, p => p.Name == "filename");
    }

    [Fact]
    public async Task UploadFileSendsMultipartWithModelAndProviderQuery()
    {
        var (client, requests, http) = CreateClient();
        using var _ = http;

        var response = await client.UploadFile(
            PhaseoFile.FromBytes(Encoding.UTF8.GetBytes("{\"custom_id\":\"a\"}\n"), "batch.jsonl"),
            purpose: "batch",
            model: "openai/gpt-5-mini",
            provider: "openai");

        Assert.Equal("file_123", response!["id"]?.ToString());
        var request = Assert.Single(requests);
        Assert.Equal("POST", request.Method);
        Assert.Equal("/batches/files?model=openai%2Fgpt-5-mini&provider=openai", request.PathAndQuery);
        Assert.Equal("multipart/form-data", request.MediaType);
        var file = Field(request, "file");
        Assert.Equal("batch.jsonl", file.FileName);
        Assert.Equal("{\"custom_id\":\"a\"}\n", file.Body);
        Assert.Equal("batch", Field(request, "purpose").Body);
        Assert.DoesNotContain(request.Parts, p => p.Name == "model" || p.Name == "provider");
    }

    [Fact]
    public async Task UploadFileDictionaryMovesModelToQuery()
    {
        var (client, requests, http) = CreateClient();
        using var _ = http;

        await client.UploadFile(new Dictionary<string, object>
        {
            ["file"] = "data:application/jsonl;base64,eyJhIjoxfQo=",
            ["purpose"] = "batch",
            ["model"] = "openai/gpt-5-mini",
        });

        var request = Assert.Single(requests);
        Assert.Equal("/batches/files?model=openai%2Fgpt-5-mini", request.PathAndQuery);
        Assert.Equal("multipart/form-data", request.MediaType);
        Assert.Equal("{\"a\":1}\n", Field(request, "file").Body);
        Assert.Equal("batch", Field(request, "purpose").Body);
    }

    [Fact]
    public async Task UploadFileWithoutFileThrows()
    {
        var (client, requests, http) = CreateClient();
        using var _ = http;

        await Assert.ThrowsAsync<ArgumentException>(() => client.UploadFile(new Dictionary<string, object> { ["purpose"] = "batch" }));
        Assert.Empty(requests);
    }

    private sealed class StubHttpHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, Task<HttpResponseMessage>> _handler;

        public StubHttpHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return _handler(request);
        }
    }
}
