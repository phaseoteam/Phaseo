using System;
using System.Collections.Generic;
using System.Globalization;
using System.Diagnostics;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Phaseo.Gen;

namespace PhaseoSdk
{
    public delegate void PhaseoLogger(string level, string message, Dictionary<string, object?> meta);

    public sealed class AsyncJobsResource
    {
        private readonly Phaseo _client;

        internal AsyncJobsResource(Phaseo client)
        {
            _client = client;
        }

        public string WebSocketUrl(string kind, string jobId, int? intervalMs = null, bool? closeOnTerminal = null)
        {
            return _client.GetAsyncJobWebSocketUrl(kind, jobId, intervalMs, closeOnTerminal);
        }
    }

    public sealed class ModelLifecycleInfo
    {
        public required string ModelId { get; init; }
        public required string Status { get; init; }
        public string? SourceStatus { get; init; }
        public string? DeprecationDate { get; init; }
        public string? RetirementDate { get; init; }
        public string? ReplacementModelId { get; init; }
        public string? Message { get; init; }
    }

    /// <summary>
    /// A file sent as a multipart/form-data part (audio for transcription/translation, JSONL for batch uploads).
    /// The gateway uses the file name extension to detect the audio format, so keep it accurate.
    /// </summary>
    public sealed class PhaseoFile
    {
        public byte[] Content { get; }
        public string FileName { get; }
        public string ContentType { get; }

        public PhaseoFile(byte[] content, string fileName, string? contentType = null)
        {
            Content = content ?? throw new ArgumentNullException(nameof(content));
            FileName = string.IsNullOrWhiteSpace(fileName) ? "file" : fileName;
            ContentType = string.IsNullOrWhiteSpace(contentType) ? GuessContentType(FileName) : contentType!;
        }

        public static PhaseoFile FromBytes(byte[] content, string fileName, string? contentType = null) => new(content, fileName, contentType);

        public static PhaseoFile FromPath(string path, string? contentType = null, string? fileName = null)
        {
            return new PhaseoFile(System.IO.File.ReadAllBytes(path), fileName ?? System.IO.Path.GetFileName(path), contentType);
        }

        /// <summary>Reads the stream to the end so the body can be rebuilt on retries.</summary>
        public static PhaseoFile FromStream(System.IO.Stream stream, string fileName, string? contentType = null)
        {
            if (stream is null) throw new ArgumentNullException(nameof(stream));
            using var buffer = new System.IO.MemoryStream();
            stream.CopyTo(buffer);
            return new PhaseoFile(buffer.ToArray(), fileName, contentType);
        }

        /// <summary>
        /// Converts a request "file" value into a file: PhaseoFile, byte[], Stream, FileInfo, a data: URL,
        /// or a path to an existing file. Returns null for anything else (for example a remote URL).
        /// </summary>
        public static PhaseoFile? FromValue(object? value, string? fileName = null, string? contentType = null)
        {
            switch (value)
            {
                case null:
                    return null;
                case PhaseoFile file:
                    return file;
                case byte[] bytes:
                    return new PhaseoFile(bytes, fileName ?? "file", contentType);
                case ReadOnlyMemory<byte> memory:
                    return new PhaseoFile(memory.ToArray(), fileName ?? "file", contentType);
                case System.IO.Stream stream:
                    return FromStream(stream, fileName ?? (stream is System.IO.FileStream fs ? System.IO.Path.GetFileName(fs.Name) : "file"), contentType);
                case System.IO.FileInfo info:
                    return FromPath(info.FullName, contentType, fileName);
                case string text:
                    if (text.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                    {
                        var comma = text.IndexOf(',');
                        if (comma < 0) return null;
                        var meta = text.Substring(5, comma - 5);
                        var data = text.Substring(comma + 1);
                        var isBase64 = meta.EndsWith(";base64", StringComparison.OrdinalIgnoreCase);
                        var mime = isBase64 ? meta.Substring(0, meta.Length - 7) : meta;
                        var semicolon = mime.IndexOf(';');
                        if (semicolon >= 0) mime = mime.Substring(0, semicolon);
                        var decoded = isBase64 ? Convert.FromBase64String(data) : System.Text.Encoding.UTF8.GetBytes(Uri.UnescapeDataString(data));
                        var resolvedMime = contentType ?? (string.IsNullOrWhiteSpace(mime) ? null : mime);
                        return new PhaseoFile(decoded, fileName ?? "file" + ExtensionFor(resolvedMime), resolvedMime);
                    }
                    if (text.Length > 0 && text.Length < 4096 && !text.Contains("://", StringComparison.Ordinal) && System.IO.File.Exists(text))
                    {
                        return FromPath(text, contentType, fileName);
                    }
                    return null;
                default:
                    return null;
            }
        }

        public override string ToString() => $"[File {FileName}, {Content.Length} bytes]";

        private static readonly Dictionary<string, string> ContentTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            [".flac"] = "audio/flac",
            [".mp3"] = "audio/mpeg",
            [".mp4"] = "audio/mp4",
            [".mpeg"] = "audio/mpeg",
            [".mpga"] = "audio/mpeg",
            [".m4a"] = "audio/mp4",
            [".ogg"] = "audio/ogg",
            [".wav"] = "audio/wav",
            [".webm"] = "audio/webm",
            [".jsonl"] = "application/jsonl",
            [".json"] = "application/json",
        };

        private static string GuessContentType(string fileName)
        {
            var extension = System.IO.Path.GetExtension(fileName);
            return !string.IsNullOrEmpty(extension) && ContentTypes.TryGetValue(extension, out var type) ? type : "application/octet-stream";
        }

        private static string ExtensionFor(string? contentType)
        {
            if (string.IsNullOrWhiteSpace(contentType)) return string.Empty;
            foreach (var pair in ContentTypes)
            {
                if (string.Equals(pair.Value, contentType, StringComparison.OrdinalIgnoreCase)) return pair.Key;
            }
            return string.Empty;
        }
    }

    internal static class MultipartRequests
    {
        private static readonly string[] FileNameKeys = { "filename", "file_name" };
        private static readonly string[] ContentTypeKeys = { "content_type", "file_content_type" };

        /// <summary>Builds a multipart body when the request carries a file-like "file" value, otherwise null.</summary>
        public static MultipartFormBody? TryBuild(Dictionary<string, object> request)
        {
            if (!request.TryGetValue("file", out var value)) return null;
            var file = PhaseoFile.FromValue(value, StringField(request, FileNameKeys), StringField(request, ContentTypeKeys));
            return file is null ? null : Build(request, file);
        }

        public static MultipartFormBody Build(Dictionary<string, object> request, PhaseoFile file)
        {
            var form = new MultipartFormBody();
            form.AddFile("file", file.Content, file.FileName, file.ContentType);
            foreach (var pair in request)
            {
                if (pair.Key == "file" || IsMetaKey(pair.Key)) continue;
                var encoded = EncodeField(pair.Value);
                if (encoded is not null) form.AddField(pair.Key, encoded);
            }
            return form;
        }

        public static Dictionary<string, object> WithFile(Dictionary<string, object>? fields, PhaseoFile file)
        {
            var request = fields is null ? new Dictionary<string, object>() : new Dictionary<string, object>(fields);
            request["file"] = file;
            return request;
        }

        /// <summary>A copy of the request that is safe to hand to telemetry (no file bytes).</summary>
        public static Dictionary<string, object> Redact(Dictionary<string, object> request)
        {
            var copy = new Dictionary<string, object>(request);
            if (copy.ContainsKey("file")) copy["file"] = "[File]";
            return copy;
        }

        /// <summary>Form fields are strings: bools lowercase, numbers invariant, objects and arrays as JSON.</summary>
        public static string? EncodeField(object? value)
        {
            switch (value)
            {
                case null:
                    return null;
                case string text:
                    return text;
                case bool flag:
                    return flag ? "true" : "false";
                case IFormattable formattable when value is sbyte or byte or short or ushort or int or uint or long or ulong or float or double or decimal:
                    return formattable.ToString(null, CultureInfo.InvariantCulture);
                case JsonElement element:
                    return element.ValueKind switch
                    {
                        JsonValueKind.Null or JsonValueKind.Undefined => null,
                        JsonValueKind.String => element.GetString(),
                        JsonValueKind.True => "true",
                        JsonValueKind.False => "false",
                        _ => element.GetRawText(),
                    };
                default:
                    return JsonSerializer.Serialize(value);
            }
        }

        private static bool IsMetaKey(string key)
        {
            return Array.IndexOf(FileNameKeys, key) >= 0 || Array.IndexOf(ContentTypeKeys, key) >= 0;
        }

        private static string? StringField(Dictionary<string, object> request, string[] keys)
        {
            foreach (var key in keys)
            {
                if (request.TryGetValue(key, out var value) && value is string text && !string.IsNullOrWhiteSpace(text)) return text;
            }
            return null;
        }
    }

    // Lightweight facade over the in-house generated SDK.
    // Regenerate with: `pnpm openapi:gen:csharp`
    public class Phaseo
    {
        private readonly global::Phaseo.Gen.Client _client;
        private readonly bool _enableDeprecationWarnings;
        private readonly bool _warningsAsErrors;
        private readonly PhaseoLogger? _logger;
        private readonly TelemetryRecorder _telemetry;
        private readonly Func<string, Task<ModelLifecycleInfo?>> _lifecycleResolver;
        private readonly string _basePath;
        private readonly HashSet<string> _warnedModels = new(StringComparer.Ordinal);
        private readonly Dictionary<string, ModelLifecycleInfo?> _lifecycleCache = new(StringComparer.Ordinal);
        public AsyncJobsResource AsyncJobs { get; }
        /// <summary>Realtime voice sessions (beta).</summary>
        public RealtimeResource Realtime { get; }
        private static readonly HashSet<string> ActiveModelSourceStatuses = new(StringComparer.Ordinal)
        {
            "active",
            "available"
        };
        private static readonly HashSet<string> InactiveModelSourceStatuses = new(StringComparer.Ordinal)
        {
            "deprecated",
            "retired",
            "withheld",
            "announced",
            "rumoured",
            "rumored",
            "unavailable",
            "disabled",
            "internal",
            "private",
            "removed",
            "sunset",
            "eol",
            "end_of_life",
            "end-of-life"
        };

        public global::Phaseo.Gen.Client RawClient => _client;

        public Phaseo(
            string? apiKey = null,
            string basePath = "https://api.phaseo.app/v1",
            bool enableDeprecationWarnings = true,
            bool warningsAsErrors = false,
            PhaseoLogger? logger = null,
            Func<string, Task<ModelLifecycleInfo?>>? lifecycleResolver = null,
            HttpClient? httpClient = null,
            DevtoolsConfig? devtools = null,
            string clientSource = "phaseo-csharp",
            string clientSourceVersion = "3.0.0")
            : this(apiKey, null, basePath, enableDeprecationWarnings, warningsAsErrors, logger, lifecycleResolver, httpClient, devtools, clientSource, clientSourceVersion)
        {
        }

        /// <summary>
        /// Creates a client whose credential comes from <paramref name="apiKeyProvider"/>: an API key, or a short-lived
        /// token such as a GitHub Actions or Vercel OIDC token for a trusted workload (see <see cref="WorkloadTokens"/>).
        /// The provider is called before every request and retry and its result is never cached by the client;
        /// cache inside the provider if fetching a token is expensive. A request that already sets an
        /// Authorization header keeps it and the provider is not called.
        /// </summary>
        public static Phaseo FromApiKeyProvider(
            Func<CancellationToken, ValueTask<string>> apiKeyProvider,
            string basePath = "https://api.phaseo.app/v1",
            bool enableDeprecationWarnings = true,
            bool warningsAsErrors = false,
            PhaseoLogger? logger = null,
            Func<string, Task<ModelLifecycleInfo?>>? lifecycleResolver = null,
            HttpClient? httpClient = null,
            DevtoolsConfig? devtools = null,
            string clientSource = "phaseo-csharp",
            string clientSourceVersion = "3.0.0")
            => new(null, apiKeyProvider ?? throw new ArgumentNullException(nameof(apiKeyProvider)), basePath, enableDeprecationWarnings, warningsAsErrors, logger, lifecycleResolver, httpClient, devtools, clientSource, clientSourceVersion);

        private Phaseo(
            string? apiKey,
            Func<CancellationToken, ValueTask<string>>? apiKeyProvider,
            string basePath,
            bool enableDeprecationWarnings,
            bool warningsAsErrors,
            PhaseoLogger? logger,
            Func<string, Task<ModelLifecycleInfo?>>? lifecycleResolver,
            HttpClient? httpClient,
            DevtoolsConfig? devtools,
            string clientSource,
            string clientSourceVersion)
        {
            var headers = new Dictionary<string, string>
            {
                { "X-Phaseo-Client", clientSource },
                { "X-Phaseo-Client-Version", clientSourceVersion }
            };
            if (apiKeyProvider is not null)
            {
                httpClient = CredentialProviderHandler.CreateHttpClient(apiKeyProvider, httpClient);
            }
            else
            {
                apiKey ??= Environment.GetEnvironmentVariable("PHASEO_API_KEY");
                if (string.IsNullOrWhiteSpace(apiKey))
                {
                    throw new InvalidOperationException("Missing API key. Pass apiKey or set PHASEO_API_KEY.");
                }

                headers["Authorization"] = $"Bearer {apiKey}";
            }

            _basePath = string.IsNullOrWhiteSpace(basePath) ? "https://api.phaseo.app/v1" : basePath.TrimEnd('/');
            _client = new global::Phaseo.Gen.Client(_basePath, httpClient, headers: headers);
            _enableDeprecationWarnings = enableDeprecationWarnings;
            _warningsAsErrors = warningsAsErrors;
            _logger = logger;
            _telemetry = new TelemetryRecorder(devtools, "3.0.0");
            _lifecycleResolver = lifecycleResolver ?? FetchModelLifecycleAsync;
            AsyncJobs = new AsyncJobsResource(this);
            Realtime = new RealtimeResource(_client, _basePath);
        }

		public Phaseo SetTimeout(TimeSpan timeout)
		{
			_client.SetTimeout(timeout);
			return this;
		}

		public Phaseo SetMaxRetries(int maxRetries)
		{
			_client.SetMaxRetries(maxRetries);
			return this;
		}

		public Phaseo SetRequestHooks(
			Action<global::Phaseo.Gen.RequestEvent>? onRequest,
			Action<global::Phaseo.Gen.ResponseEvent>? onResponse,
			Action<global::Phaseo.Gen.RetryEvent>? onRetry)
		{
			_client.SetHooks(onRequest, onResponse, onRetry);
			return this;
		}

		public Task<global::Phaseo.Gen.RawResponse<Dictionary<string, object>>> RequestWithResponse(
			string method,
			string path,
			Dictionary<string, string>? query = null,
			Dictionary<string, string>? headers = null,
			object? body = null,
			global::Phaseo.Gen.RequestOptions? options = null)
		{
			return _client.SendWithResponseAsync<Dictionary<string, object>>(method, path, query, headers, body, options);
		}

        public async Task<ModelLifecycleInfo?> GetModelDeprecationInfo(string modelId)
        {
            var normalized = modelId?.Trim();
            if (string.IsNullOrWhiteSpace(normalized))
            {
                return null;
            }

            if (_lifecycleCache.TryGetValue(normalized, out var cached))
            {
                return cached;
            }

            var resolved = await _lifecycleResolver(normalized).ConfigureAwait(false);
            _lifecycleCache[normalized] = resolved;
            return resolved;
        }

        public async Task<Dictionary<string, object?>> ValidateModel(string modelId)
        {
            var info = await GetModelDeprecationInfo(modelId).ConfigureAwait(false);
            if (info is null)
            {
                return new Dictionary<string, object?> { ["ok"] = true, ["info"] = null };
            }

            if (!IsModelRequestableForInference(info))
            {
                return new Dictionary<string, object?>
                {
                    ["ok"] = false,
                    ["info"] = info,
                    ["reason"] = BuildInactiveModelRequestMessage(info)
                };
            }

            return new Dictionary<string, object?> { ["ok"] = true, ["info"] = info };
        }

        private async Task MaybeWarnForPayload(object? payload)
        {
            var modelId = ExtractModelId(payload);
            if (string.IsNullOrWhiteSpace(modelId))
            {
                return;
            }

            await EnsureModelRequestable(modelId).ConfigureAwait(false);
            await MaybeWarnForModel(modelId).ConfigureAwait(false);
        }

        private async Task EnsureModelRequestable(string modelId)
        {
            var normalized = modelId.Trim();
            if (normalized.Length == 0)
            {
                return;
            }

            var lifecycle = await GetModelDeprecationInfo(normalized).ConfigureAwait(false);
            if (lifecycle is null)
            {
                return;
            }

            if (IsModelRequestableForInference(lifecycle))
            {
                return;
            }

            throw new InvalidOperationException(BuildInactiveModelRequestMessage(lifecycle));
        }

        private async Task MaybeWarnForModel(string modelId)
        {
            if (!_enableDeprecationWarnings)
            {
                return;
            }

            var normalized = modelId.Trim();
            if (normalized.Length == 0)
            {
                return;
            }

            var lifecycle = await GetModelDeprecationInfo(normalized).ConfigureAwait(false);
            if (lifecycle is null || string.Equals(NormalizeRequestabilityStatus(lifecycle.Status), "active", StringComparison.Ordinal))
            {
                return;
            }

            var message = lifecycle.Message ??
                          BuildLifecycleMessage(
                              lifecycle.Status,
                              lifecycle.ModelId,
                              lifecycle.DeprecationDate,
                              lifecycle.RetirementDate,
                              lifecycle.ReplacementModelId);

            if (_warningsAsErrors)
            {
                throw new InvalidOperationException(message);
            }

            if (!_warnedModels.Add(normalized))
            {
                return;
            }

            var meta = new Dictionary<string, object?>
            {
                ["model_id"] = lifecycle.ModelId,
                ["status"] = lifecycle.Status,
                ["deprecation_date"] = lifecycle.DeprecationDate,
                ["retirement_date"] = lifecycle.RetirementDate,
                ["replacement_model_id"] = lifecycle.ReplacementModelId
            };

            if (_logger is not null)
            {
                _logger("warn", message, meta);
                return;
            }

            Console.Error.WriteLine(message);
        }

        private async Task<ModelLifecycleInfo?> FetchModelLifecycleAsync(string modelId)
        {
            Dictionary<string, object>? response;
            try
            {
                response = await Operations.ListModelsAsync(
                    _client,
                    query: new Dictionary<string, string>
                    {
                        ["model_id"] = modelId,
                        ["limit"] = "1"
                    }).ConfigureAwait(false);
            }
            catch
            {
                return null;
            }

            if (response is null)
            {
                return null;
            }

            var root = JsonSerializer.SerializeToElement(response);
            if (!root.TryGetProperty("models", out var models) || models.ValueKind != JsonValueKind.Array)
            {
                return null;
            }

            foreach (var model in models.EnumerateArray())
            {
                var candidate = GetString(model, "model_id");
                if (!string.Equals(candidate, modelId, StringComparison.Ordinal))
                {
                    continue;
                }
                return ToModelLifecycleInfo(model, modelId);
            }

            return null;
        }

        public Task<Dictionary<string, object>?> GenerateText(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "chat.completions",
                request,
                true,
                () => Operations.CreateChatCompletionAsync(_client, body: request));
        }

        public Task<Dictionary<string, object>?> CreateChatCompletion(Dictionary<string, object> request)
        {
            return GenerateText(request);
        }

        public Task<Dictionary<string, object>?> GenerateResponse(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "responses",
                request,
                true,
                () => Operations.CreateResponseAsync(_client, body: request));
        }

        public Task<Dictionary<string, object>?> CreateResponse(Dictionary<string, object> request)
        {
            return GenerateResponse(request);
        }

		public IAsyncEnumerable<string> StreamResponse(Dictionary<string, object> request, CancellationToken cancellationToken = default)
		{
			request = new Dictionary<string, object>(request) { ["stream"] = true };
			return _client.StreamLinesAsync("POST", "/responses", body: request, cancellationToken: cancellationToken);
		}

        public Task<Dictionary<string, object>?> CreateAnthropicMessage(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "messages",
                request,
                true,
                () => Operations.CreateAnthropicMessageAsync(_client, body: request));
        }

        public Task<Dictionary<string, object>?> GenerateImage(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "images.generations",
                request,
                true,
                () => Operations.CreateImageAsync(_client, body: request));
        }

        public Task<Dictionary<string, object>?> CreateImage(Dictionary<string, object> request)
        {
            return GenerateImage(request);
        }

        public Task<Dictionary<string, object>?> CreateImageEdit(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "images.edits",
                request,
                true,
                () => Operations.CreateImageEditAsync(_client, body: request));
        }

        public Task<Dictionary<string, object>?> CreateEmbedding(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "embeddings",
                request,
                true,
                () => Operations.CreateEmbeddingAsync(_client, body: request));
        }

        public Task<Dictionary<string, object>?> GenerateModeration(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "moderations",
                request,
                true,
                () => Operations.CreateModerationAsync(_client, body: request));
        }

        public Task<Dictionary<string, object>?> CreateModeration(Dictionary<string, object> request)
        {
            return GenerateModeration(request);
        }

        public Task<Dictionary<string, object>?> GenerateVideo(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "video.generations",
                request,
                true,
                () => Operations.CreateVideoAsync(_client, body: request));
        }

        public Task<Dictionary<string, object>?> CreateVideo(Dictionary<string, object> request)
        {
            return GenerateVideo(request);
        }

        public Task<Dictionary<string, object>?> GetVideo(string videoId)
        {
            return WithLifecycleAndTelemetry(
                "video.retrieve",
                new Dictionary<string, object> { ["video_id"] = videoId },
                false,
                () => Operations.GetVideoAsync(_client, path: new Dictionary<string, string> { { "video_id", videoId } }));
        }

        public Task<Dictionary<string, object>?> CancelVideo(string videoId)
        {
            return WithLifecycleAndTelemetry(
                "video.cancel",
                new Dictionary<string, object> { ["video_id"] = videoId },
                false,
                () => _client.SendAsync<Dictionary<string, object>?>("POST", $"/videos/{Uri.EscapeDataString(videoId)}/cancel"));
        }

        public Task<Dictionary<string, object>?> DeleteVideo(string videoId)
        {
            return WithLifecycleAndTelemetry(
                "video.delete",
                new Dictionary<string, object> { ["video_id"] = videoId },
                false,
                () => Operations.DeleteVideoAsync(_client, path: new Dictionary<string, string> { { "video_id", videoId } }));
        }

        public Task<Dictionary<string, object>?> ListVideoModels()
        {
            return WithLifecycleAndTelemetry(
                "video.models",
                null,
                false,
                () => Operations.ListVideoModelsAsync(_client));
        }

        public Task<Dictionary<string, object>?> ListVideos(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry(
                "video.list",
                query,
                false,
                () => Operations.ListVideosAsync(_client, query: query));
        }

        public Task<object?> CreateSpeech(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "audio.speech",
                request,
                true,
                () => Operations.CreateSpeechAsync(_client, body: request));
        }

        /// <summary>
        /// Transcribes audio. When request["file"] is a <see cref="PhaseoFile"/>, byte[], Stream, FileInfo,
        /// data: URL or local path, the request is sent as multipart/form-data; requests that only carry
        /// file_url, file_id or s3_presigned_url are sent as JSON.
        /// </summary>
        public Task<Dictionary<string, object>?> CreateTranscription(Dictionary<string, object> request)
        {
            var form = MultipartRequests.TryBuild(request);
            return WithLifecycleAndTelemetry(
                "audio.transcriptions",
                form is null ? request : MultipartRequests.Redact(request),
                true,
                () => Operations.CreateTranscriptionAsync(_client, body: (object?)form ?? request));
        }

        /// <summary>Transcribes an audio file sent as multipart/form-data. Other fields (model, language, ...) go in <paramref name="fields"/>.</summary>
        public Task<Dictionary<string, object>?> CreateTranscription(PhaseoFile file, Dictionary<string, object>? fields = null)
        {
            return CreateTranscription(MultipartRequests.WithFile(fields, file));
        }

        /// <summary>
        /// Translates audio to English. The gateway requires a multipart "file" part, so request["file"] should be a
        /// <see cref="PhaseoFile"/>, byte[], Stream, FileInfo, data: URL or local path.
        /// </summary>
        public Task<Dictionary<string, object>?> CreateTranslation(Dictionary<string, object> request)
        {
            var form = MultipartRequests.TryBuild(request);
            return WithLifecycleAndTelemetry(
                "audio.translations",
                form is null ? request : MultipartRequests.Redact(request),
                true,
                () => Operations.CreateTranslationAsync(_client, body: (object?)form ?? request));
        }

        /// <summary>Translates an audio file sent as multipart/form-data. Other fields (model, prompt, ...) go in <paramref name="fields"/>.</summary>
        public Task<Dictionary<string, object>?> CreateTranslation(PhaseoFile file, Dictionary<string, object>? fields = null)
        {
            return CreateTranslation(MultipartRequests.WithFile(fields, file));
        }

        public Task<Dictionary<string, object>?> CreateBatch(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "batches.create",
                request,
                true,
                () => Operations.CreateBatchAsync(_client, body: request));
        }

        public Task<Dictionary<string, object>?> RetrieveBatch(string batchId)
        {
            return WithLifecycleAndTelemetry(
                "batches.retrieve",
                new Dictionary<string, object> { ["batch_id"] = batchId },
                false,
                () => Operations.RetrieveBatchAsync(_client, path: new Dictionary<string, string> { { "batch_id", batchId } }));
        }

        public Task<Dictionary<string, object>?> CancelBatch(string batchId)
        {
            return WithLifecycleAndTelemetry(
                "batches.cancel",
                new Dictionary<string, object> { ["batch_id"] = batchId },
                false,
                () => Operations.CancelBatchAsync(_client, path: new Dictionary<string, string> { { "batch_id", batchId } }));
        }

        public string GetAsyncJobWebSocketUrl(string kind, string jobId, int? intervalMs = null, bool? closeOnTerminal = null)
        {
            if (string.IsNullOrWhiteSpace(kind))
            {
                throw new ArgumentException("kind is required", nameof(kind));
            }

            if (string.IsNullOrWhiteSpace(jobId))
            {
                throw new ArgumentException("jobId is required", nameof(jobId));
            }

            var wsBasePath = _basePath.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
                ? "wss://" + _basePath["https://".Length..]
                : _basePath.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
                    ? "ws://" + _basePath["http://".Length..]
                    : _basePath;
            var url = $"{wsBasePath}/async/{Uri.EscapeDataString(kind.Trim())}/{Uri.EscapeDataString(jobId.Trim())}/ws";
            var query = new List<string>();
            if (intervalMs.HasValue)
            {
                query.Add($"interval_ms={intervalMs.Value.ToString(CultureInfo.InvariantCulture)}");
            }
            if (closeOnTerminal.HasValue)
            {
                query.Add($"close_on_terminal={closeOnTerminal.Value.ToString().ToLowerInvariant()}");
            }
            if (query.Count > 0)
            {
                url += "?" + string.Join("&", query);
            }
            return url;
        }

        public string GetBatchWebSocketUrl(string batchId, int? intervalMs = null, bool? closeOnTerminal = null)
        {
            return GetAsyncJobWebSocketUrl("batch", batchId, intervalMs, closeOnTerminal);
        }

        public string GetVideoWebSocketUrl(string videoId, int? intervalMs = null, bool? closeOnTerminal = null)
        {
            return GetAsyncJobWebSocketUrl("video", videoId, intervalMs, closeOnTerminal);
        }

        public Task<Dictionary<string, object>?> ListModels(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("models.list", query, false, () => Operations.ListModelsAsync(_client, query: query));
        }

        public Task<Dictionary<string, object>?> GetModelEndpointCapabilities(string modelId, Dictionary<string, string>? query = null)
        {
            var parts = modelId?.Trim().Split('/', 2) ?? [];
            if (parts.Length != 2 || string.IsNullOrWhiteSpace(parts[0]) || string.IsNullOrWhiteSpace(parts[1])) throw new ArgumentException("model ID must use author/slug format", nameof(modelId));
            return WithLifecycleAndTelemetry("models.capabilities", new { model_id = modelId, query }, false, () => Operations.ListModelEndpointsAsync(_client, path: new Dictionary<string, string> { ["author"] = parts[0], ["slug"] = parts[1] }, query: query));
        }

        public async Task<System.Text.Json.Nodes.JsonObject> CheckModelParameters(string modelId, IReadOnlyDictionary<string, object?> values, IReadOnlyDictionary<string, object?>? options = null)
        {
            var response = await GetModelEndpointCapabilities(modelId).ConfigureAwait(false);
            var node = System.Text.Json.JsonSerializer.SerializeToNode(response) ?? new System.Text.Json.Nodes.JsonObject();
            return ParameterSupport.Check(node, values, options);
        }

        public async Task<System.Text.Json.Nodes.JsonObject> PreflightRequest(IReadOnlyDictionary<string, object?> request, IReadOnlyDictionary<string, object?>? options = null)
        {
            var modelId = request.TryGetValue("model", out var model) ? model?.ToString()?.Trim() : null;
            if (string.IsNullOrWhiteSpace(modelId)) throw new ArgumentException("preflight requires request model", nameof(request));
            var structural = new HashSet<string>(StringComparer.Ordinal) { "model", "input", "messages", "prompt", "contents", "provider", "providers", "routing", "metadata", "session_id", "app", "webhook", "idempotency_key" };
            var values = request.Where(entry => entry.Value is not null && !structural.Contains(entry.Key)).ToDictionary(entry => entry.Key, entry => entry.Value);
            var support = await CheckModelParameters(modelId, values, options).ConfigureAwait(false);
            return new System.Text.Json.Nodes.JsonObject
            {
                ["ok"] = support["ok"]?.DeepClone(),
                ["model_id"] = modelId,
                ["checked_parameters"] = System.Text.Json.JsonSerializer.SerializeToNode(values),
                ["parameter_support"] = support.DeepClone(),
            };
        }

        public Task<Dictionary<string, object>?> ListProviders(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("providers", query, false, () => Operations.ListProvidersAsync(_client, query: query));
        }

        public Task<Dictionary<string, object>?> GetAnalytics(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("analytics", query, false, () => Operations.GetActivityAliasAsync(_client, query: query));
        }

        public Task<Dictionary<string, object>?> GetCredits(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("credits", query, false, () => Operations.GetCreditsAsync(_client, query: query));
        }

        public Task<Dictionary<string, object>?> GetActivity(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("activity", query, false, () => Operations.GetActivityAsync(_client, query: query));
        }

        public Task<Dictionary<string, object>?> GetGeneration(string generationId)
        {
            return WithLifecycleAndTelemetry(
                "generations.retrieve",
                new Dictionary<string, object> { ["id"] = generationId },
                false,
                () => Operations.GetGenerationAsync(_client, query: new Dictionary<string, string> { { "id", generationId } }));
        }

        public Task<Dictionary<string, object>?> ListFiles(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("files.list", query, false, async () => NormalizeDictionary(await Operations.ListFilesAsync(_client, query: query).ConfigureAwait(false)));
        }

        public Task<Dictionary<string, object>?> ListEndpoints()
        {
            return WithLifecycleAndTelemetry("endpoints.list", null, false, () => Operations.ListEndpointsAsync(_client));
        }

        public Task<Dictionary<string, object>?> ListOrganisations(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("organisations.list", query, false, () => Operations.ListOrganisationsAsync(_client, query: query));
        }

        public Task<Dictionary<string, object>?> ListPricingModels(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("pricing.models", query, false, () => Operations.ListPricingModelsAsync(_client, query: query));
        }

        public Task<Dictionary<string, object>?> CalculatePricing(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry("pricing.calculate", request, false, () => Operations.CalculatePricingAsync(_client, body: request));
        }

        public Task<Dictionary<string, object>?> ListApiKeys(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("provisioning.keys.list", query, false, () => Operations.ListApiKeysAsync(_client, query: query));
        }

        public Task<Dictionary<string, object>?> CreateApiKey(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry("provisioning.keys.create", request, false, () => Operations.CreateApiKeyAsync(_client, body: request));
        }

        public Task<Dictionary<string, object>?> GetApiKey(string id)
        {
            return WithLifecycleAndTelemetry(
                "provisioning.keys.get",
                new Dictionary<string, object> { ["id"] = id },
                false,
                () => Operations.GetApiKeyAsync(_client, path: new Dictionary<string, string> { { "id", id } }));
        }

        public Task<Dictionary<string, object>?> UpdateApiKey(string id, Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "provisioning.keys.update",
                new Dictionary<string, object> { ["id"] = id, ["body"] = request },
                false,
                () => Operations.UpdateApiKeyAsync(_client, path: new Dictionary<string, string> { { "id", id } }, body: request));
        }

        public Task<Dictionary<string, object>?> DeleteApiKey(string id)
        {
            return WithLifecycleAndTelemetry(
                "provisioning.keys.delete",
                new Dictionary<string, object> { ["id"] = id },
                false,
                () => Operations.DeleteApiKeyAsync(_client, path: new Dictionary<string, string> { { "id", id } }));
        }

        public Task<Dictionary<string, object>?> ListWorkspaces(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("provisioning.workspaces.list", query, false, () => Operations.ListWorkspacesAsync(_client, query: query));
        }

        public Task<Dictionary<string, object>?> GetWorkspace(string id)
        {
            return WithLifecycleAndTelemetry(
                "provisioning.workspaces.get",
                new Dictionary<string, object> { ["id"] = id },
                false,
                () => Operations.GetWorkspaceAsync(_client, path: new Dictionary<string, string> { { "id", id } }));
        }

        public Task<Dictionary<string, object>?> CreateWorkspace(Dictionary<string, object> body)
        {
            return WithLifecycleAndTelemetry(
                "provisioning.workspaces.create",
                body,
                false,
                () => Operations.CreateWorkspaceAsync(_client, body: body));
        }

        public Task<Dictionary<string, object>?> UpdateWorkspace(string id, Dictionary<string, object> body)
        {
            var payload = new Dictionary<string, object>(body)
            {
                ["id"] = id
            };
            return WithLifecycleAndTelemetry(
                "provisioning.workspaces.update",
                payload,
                false,
                () => Operations.UpdateWorkspaceAsync(_client, path: new Dictionary<string, string> { { "id", id } }, body: body));
        }

        public Task<Dictionary<string, object>?> DeleteWorkspace(string id)
        {
            return WithLifecycleAndTelemetry(
                "provisioning.workspaces.delete",
                new Dictionary<string, object> { ["id"] = id },
                false,
                () => Operations.DeleteWorkspaceAsync(_client, path: new Dictionary<string, string> { { "id", id } }));
        }

        public Task<Dictionary<string, object>?> GetCurrentApiKey()
        {
            return WithLifecycleAndTelemetry("key.current", null, false, () => Operations.GetCurrentApiKeyAsync(_client));
        }

        public Task<Dictionary<string, object>?> RetrieveFile(string fileId)
        {
            return WithLifecycleAndTelemetry(
                "files.retrieve",
                new Dictionary<string, object> { ["file_id"] = fileId },
                false,
                () => Operations.RetrieveFileAsync(_client, path: new Dictionary<string, string> { { "file_id", fileId } }));
        }

        public Task<byte[]> RetrieveFileContent(string fileId)
        {
            return WithLifecycleAndTelemetry(
                "files.content",
                new Dictionary<string, object> { ["file_id"] = fileId },
                false,
                () => _client.SendBytesAsync("GET", $"/files/{Uri.EscapeDataString(fileId)}/content"));
        }

        public Task<byte[]> RetrieveVideoContent(string videoId)
        {
            return WithLifecycleAndTelemetry(
                "video.content",
                new Dictionary<string, object> { ["video_id"] = videoId },
                false,
                () => _client.SendBytesAsync("GET", $"/videos/{Uri.EscapeDataString(videoId)}/content"));
        }

        public Task<Dictionary<string, object>?> GetVideoDownloadUrl(string videoId, Dictionary<string, object>? request = null)
        {
            request ??= new Dictionary<string, object>();
            return WithLifecycleAndTelemetry(
                "video.download_url",
                new Dictionary<string, object> { ["video_id"] = videoId, ["body"] = request },
                false,
                () => _client.SendAsync<Dictionary<string, object>?>("POST", $"/videos/{Uri.EscapeDataString(videoId)}/download_url", body: request));
        }

        /// <summary>
        /// Uploads a batch input file as multipart/form-data to POST /batches/files. request["file"] must be a
        /// <see cref="PhaseoFile"/>, byte[], Stream, FileInfo, data: URL or local path; other entries (purpose, ...)
        /// become form fields. model and provider (arguments or request entries) are sent as query parameters.
        /// </summary>
        public Task<Dictionary<string, object>?> UploadFile(Dictionary<string, object> request, string? model = null, string? provider = null)
        {
            if (request is null) throw new ArgumentNullException(nameof(request));
            var fields = new Dictionary<string, object>(request);
            model ??= TakeString(fields, "model");
            provider ??= TakeString(fields, "provider");
            fields.Remove("model");
            fields.Remove("provider");
            var form = MultipartRequests.TryBuild(fields)
                ?? throw new ArgumentException("UploadFile requires request[\"file\"] to be a PhaseoFile, byte[], Stream, FileInfo, data: URL or path to an existing file.", nameof(request));
            var query = new Dictionary<string, string>();
            if (!string.IsNullOrWhiteSpace(model)) query["model"] = model!;
            if (!string.IsNullOrWhiteSpace(provider)) query["provider"] = provider!;
            var telemetryPayload = MultipartRequests.Redact(fields);
            if (query.TryGetValue("model", out var m)) telemetryPayload["model"] = m;
            if (query.TryGetValue("provider", out var p)) telemetryPayload["provider"] = p;
            return WithLifecycleAndTelemetry(
                "files.upload",
                telemetryPayload,
                false,
                () => _client.SendAsync<Dictionary<string, object>?>("POST", "/batches/files", query.Count > 0 ? query : null, null, form));
        }

        /// <summary>Uploads a batch input file (multipart/form-data, POST /batches/files).</summary>
        public Task<Dictionary<string, object>?> UploadFile(PhaseoFile file, string? purpose = null, string? model = null, string? provider = null)
        {
            var request = new Dictionary<string, object> { ["file"] = file };
            if (!string.IsNullOrWhiteSpace(purpose)) request["purpose"] = purpose!;
            return UploadFile(request, model, provider);
        }

        private static string? TakeString(Dictionary<string, object> values, string key)
        {
            if (!values.TryGetValue(key, out var value)) return null;
            var text = value is JsonElement element && element.ValueKind == JsonValueKind.String ? element.GetString() : value?.ToString();
            return string.IsNullOrWhiteSpace(text) ? null : text;
        }

        public Task<Dictionary<string, object>?> Health()
        {
            return WithLifecycleAndTelemetry("health", null, false, () => _client.SendAsync<Dictionary<string, object>?>("GET", "/health"));
        }

        public Task<Dictionary<string, object>?> Healthz()
        {
            return Health();
        }

        private static string? ExtractModelId(object? payload)
        {
            if (payload is null)
            {
                return null;
            }

            if (payload is Dictionary<string, object> dict &&
                dict.TryGetValue("model", out var modelValue))
            {
                return modelValue?.ToString()?.Trim();
            }

            var root = JsonSerializer.SerializeToElement(payload);
            if (root.ValueKind == JsonValueKind.Object &&
                root.TryGetProperty("model", out var modelProp) &&
                modelProp.ValueKind == JsonValueKind.String)
            {
                return modelProp.GetString()?.Trim();
            }
            return null;
        }

        private static ModelLifecycleInfo ToModelLifecycleInfo(JsonElement model, string fallbackModelId)
        {
            var lifecycle = GetObject(model, "lifecycle");
            var modelId = FirstNonEmpty(GetString(model, "model_id"), fallbackModelId) ?? fallbackModelId;
            var sourceStatus = FirstNonEmpty(GetString(model, "status"), GetString(lifecycle, "status"));
            var deprecationDate = FirstNonEmpty(GetString(lifecycle, "deprecation_date"), GetString(model, "deprecation_date"));
            var retirementDate = FirstNonEmpty(GetString(lifecycle, "retirement_date"), GetString(model, "retirement_date"));
            var status = NormalizeLifecycleStatus(
                FirstNonEmpty(GetString(lifecycle, "status"), GetString(model, "status")),
                deprecationDate,
                retirementDate);
            var replacementModelId = FirstNonEmpty(GetString(lifecycle, "replacement_model_id"));
            var message = FirstNonEmpty(
                GetString(lifecycle, "message"),
                BuildLifecycleMessage(status, modelId, deprecationDate, retirementDate, replacementModelId));

            return new ModelLifecycleInfo
            {
                ModelId = modelId,
                Status = status,
                SourceStatus = sourceStatus,
                DeprecationDate = deprecationDate,
                RetirementDate = retirementDate,
                ReplacementModelId = replacementModelId,
                Message = message
            };
        }

        private static string NormalizeLifecycleStatus(string? status, string? deprecationDate, string? retirementDate)
        {
            var normalized = (status ?? string.Empty).Trim().ToLowerInvariant();
            if (normalized is "active" or "deprecated" or "retired")
            {
                return normalized;
            }

            var now = DateTimeOffset.UtcNow;
            if (TryParseIsoDateTime(retirementDate, out var retirementAt) && retirementAt <= now)
            {
                return "retired";
            }
            if (TryParseIsoDateTime(deprecationDate, out var deprecatedAt) && deprecatedAt <= now)
            {
                return "deprecated";
            }
            return "active";
        }

        private static bool TryParseIsoDateTime(string? value, out DateTimeOffset parsed)
        {
            return DateTimeOffset.TryParse(
                value,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal,
                out parsed);
        }

        private static string BuildLifecycleMessage(
            string status,
            string modelId,
            string? deprecationDate,
            string? retirementDate,
            string? replacementModelId)
        {
            var replacement = string.IsNullOrWhiteSpace(replacementModelId)
                ? string.Empty
                : $" Use \"{replacementModelId}\" instead.";

            return status switch
            {
                "retired" when !string.IsNullOrWhiteSpace(retirementDate)
                    => $"[phaseo] Model \"{modelId}\" is retired as of {retirementDate}.{replacement}",
                "retired"
                    => $"[phaseo] Model \"{modelId}\" is retired.{replacement}",
                "deprecated" when !string.IsNullOrWhiteSpace(retirementDate)
                    => $"[phaseo] Model \"{modelId}\" is deprecated and scheduled for retirement on {retirementDate}.{replacement}",
                "deprecated" when !string.IsNullOrWhiteSpace(deprecationDate)
                    => $"[phaseo] Model \"{modelId}\" has been deprecated since {deprecationDate}.{replacement}",
                "deprecated"
                    => $"[phaseo] Model \"{modelId}\" is deprecated.{replacement}",
                _ => string.Empty
            };
        }

        private static string? NormalizeSourceStatus(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }
            return value.Trim().ToLowerInvariant();
        }

        private static string NormalizeRequestabilityStatus(string? value)
        {
            return NormalizeSourceStatus(value) switch
            {
                "active" or "available" => "active",
                "deprecated" => "deprecated",
                "retired" => "retired",
                _ => string.Empty
            };
        }

        private static bool IsModelRequestableForInference(ModelLifecycleInfo info)
        {
            if (!string.Equals(NormalizeRequestabilityStatus(info.Status), "active", StringComparison.Ordinal))
            {
                return false;
            }

            var sourceStatus = NormalizeSourceStatus(info.SourceStatus);
            if (sourceStatus is null)
            {
                return true;
            }
            if (ActiveModelSourceStatuses.Contains(sourceStatus))
            {
                return true;
            }
            if (InactiveModelSourceStatuses.Contains(sourceStatus))
            {
                return false;
            }
            return false;
        }

        private static string BuildInactiveModelRequestMessage(ModelLifecycleInfo info)
        {
            var normalizedStatus = NormalizeRequestabilityStatus(info.Status);
            if (!string.Equals(normalizedStatus, "active", StringComparison.Ordinal))
            {
                var lifecycleStatusForMessage = string.IsNullOrWhiteSpace(normalizedStatus)
                    ? (NormalizeSourceStatus(info.Status) ?? info.Status)
                    : normalizedStatus;
                var fallback = BuildLifecycleMessage(
                    lifecycleStatusForMessage,
                    info.ModelId,
                    info.DeprecationDate,
                    info.RetirementDate,
                    info.ReplacementModelId);
                if (!string.IsNullOrWhiteSpace(info.Message))
                {
                    return info.Message!;
                }
                if (!string.IsNullOrWhiteSpace(fallback))
                {
                    return fallback;
                }
                return $"[phaseo] Model \"{info.ModelId}\" is not active for inference.";
            }

            var sourceStatus = NormalizeSourceStatus(info.SourceStatus) ?? "unknown";
            var replacement = string.IsNullOrWhiteSpace(info.ReplacementModelId)
                ? string.Empty
                : $" Use \"{info.ReplacementModelId}\" instead.";
            return $"[phaseo] Model \"{info.ModelId}\" is not active for inference (status: {sourceStatus}).{replacement}";
        }

        private static JsonElement GetObject(JsonElement source, string property)
        {
            if (source.ValueKind == JsonValueKind.Object &&
                source.TryGetProperty(property, out var nested) &&
                nested.ValueKind == JsonValueKind.Object)
            {
                return nested;
            }
            return default;
        }

        private static string? GetString(JsonElement source, string property)
        {
            if (source.ValueKind == JsonValueKind.Object &&
                source.TryGetProperty(property, out var value) &&
                value.ValueKind == JsonValueKind.String)
            {
                var str = value.GetString()?.Trim();
                return string.IsNullOrWhiteSpace(str) ? null : str;
            }
            return null;
        }

        private static string? FirstNonEmpty(params string?[] values)
        {
            foreach (var value in values)
            {
                if (!string.IsNullOrWhiteSpace(value))
                {
                    return value.Trim();
                }
            }
            return null;
        }

        private async Task<T> WithLifecycleAndTelemetry<T>(string endpoint, object? payload, bool checkLifecycle, Func<Task<T>> operation)
        {
            var stopwatch = Stopwatch.StartNew();
            try
            {
                if (checkLifecycle)
                {
                    await MaybeWarnForPayload(payload).ConfigureAwait(false);
                }
                var result = await operation().ConfigureAwait(false);
                _telemetry.CaptureSuccess(endpoint, payload, result, stopwatch.ElapsedMilliseconds);
                return result;
            }
            catch (Exception ex)
            {
                _telemetry.CaptureError(endpoint, payload, ex, stopwatch.ElapsedMilliseconds);
                throw;
            }
        }

        private static Dictionary<string, object>? NormalizeDictionary(object? payload)
        {
            if (payload is null)
            {
                return null;
            }

            if (payload is Dictionary<string, object> dict)
            {
                return dict;
            }

            if (payload is JsonElement json)
            {
                return JsonSerializer.Deserialize<Dictionary<string, object>>(json.GetRawText());
            }

            return JsonSerializer.Deserialize<Dictionary<string, object>>(JsonSerializer.Serialize(payload));
        }
    }

}
