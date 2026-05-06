using System.Net;
using System.Net.Http;
using System.Text;
using AiStatsSdk;
using Xunit;

namespace AIStats.Sdk.Tests;

public class FilesTests
{
    [Fact]
    public async Task UploadFileReturnsPayload()
    {
        var handler = new StubHttpHandler(async (request) =>
        {
            if (request.RequestUri?.AbsolutePath == "/files" && request.Method == HttpMethod.Post)
            {
                var body = await request.Content!.ReadAsStringAsync();
                Assert.Contains("\"purpose\":\"batch\"", body);
                Assert.Contains("\"file\":\"data:application/json;base64,eyJ0ZXN0Ijp0cnVlfQ==\"", body);

                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(
                        "{\"id\":\"file_123\",\"purpose\":\"batch\",\"bytes\":17}",
                        Encoding.UTF8,
                        "application/json")
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

        var response = await client.UploadFile(new Dictionary<string, object>
        {
            ["purpose"] = "batch",
            ["file"] = "data:application/json;base64,eyJ0ZXN0Ijp0cnVlfQ==",
        });

        Assert.Equal("file_123", response!["id"]?.ToString());
        Assert.Equal("batch", response["purpose"]?.ToString());
    }

    [Fact]
    public async Task RetrieveFileContentReturnsBytes()
    {
        var handler = new StubHttpHandler((request) =>
        {
            if (request.RequestUri?.AbsolutePath == "/files/file_123/content")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new ByteArrayContent(Encoding.UTF8.GetBytes("{\"ok\":true}\n"))
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

        var content = await client.RetrieveFileContent("file_123");

        Assert.Equal("{\"ok\":true}\n", Encoding.UTF8.GetString(content));
    }

    [Fact]
    public async Task RetrieveFileContentSurfacesApiErrors()
    {
        var handler = new StubHttpHandler((_request) =>
            new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("{\"error\":\"not found\"}", Encoding.UTF8, "application/json")
            });

        using var httpClient = new HttpClient(handler);
        var client = new AiStatsSdk.AIStats(
            apiKey: "test",
            basePath: "http://localhost",
            enableDeprecationWarnings: false,
            httpClient: httpClient);

        await Assert.ThrowsAsync<AiStats.Gen.ApiErrorException>(() => client.RetrieveFileContent("file_missing_123"));
    }

    private sealed class StubHttpHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, Task<HttpResponseMessage>> _handler;

        public StubHttpHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> handler)
        {
            _handler = handler;
        }

        public StubHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        {
            _handler = (request) => Task.FromResult(handler(request));
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return _handler(request);
        }
    }
}
