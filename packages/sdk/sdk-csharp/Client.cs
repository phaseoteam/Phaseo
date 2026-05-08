using System;
using System.Collections.Generic;
using System.Globalization;
using System.Diagnostics;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using AiStats.Gen;

namespace AiStatsSdk
{
    public delegate void AIStatsLogger(string level, string message, Dictionary<string, object?> meta);

    public sealed class AsyncJobsResource
    {
        private readonly AIStats _client;

        internal AsyncJobsResource(AIStats client)
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

    // Lightweight facade over the in-house generated SDK.
    // Regenerate with: `pnpm openapi:gen:csharp`
    public class AIStats
    {
        private readonly AiStats.Gen.Client _client;
        private readonly bool _enableDeprecationWarnings;
        private readonly bool _warningsAsErrors;
        private readonly AIStatsLogger? _logger;
        private readonly TelemetryRecorder _telemetry;
        private readonly Func<string, Task<ModelLifecycleInfo?>> _lifecycleResolver;
        private readonly string _basePath;
        private readonly HashSet<string> _warnedModels = new(StringComparer.Ordinal);
        private readonly Dictionary<string, ModelLifecycleInfo?> _lifecycleCache = new(StringComparer.Ordinal);
        public AsyncJobsResource AsyncJobs { get; }
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

        public AiStats.Gen.Client RawClient => _client;

        public AIStats(
            string? apiKey = null,
            string basePath = "https://api.phaseo.app/v1",
            bool enableDeprecationWarnings = true,
            bool warningsAsErrors = false,
            AIStatsLogger? logger = null,
            Func<string, Task<ModelLifecycleInfo?>>? lifecycleResolver = null,
            HttpClient? httpClient = null,
            DevtoolsConfig? devtools = null)
        {
            apiKey ??= Environment.GetEnvironmentVariable("AI_STATS_API_KEY");
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                throw new InvalidOperationException("Missing API key. Pass apiKey or set AI_STATS_API_KEY.");
            }

            var headers = new Dictionary<string, string> { { "Authorization", $"Bearer {apiKey}" } };
            _basePath = string.IsNullOrWhiteSpace(basePath) ? "https://api.phaseo.app/v1" : basePath.TrimEnd('/');
            _client = new AiStats.Gen.Client(_basePath, httpClient, headers: headers);
            _enableDeprecationWarnings = enableDeprecationWarnings;
            _warningsAsErrors = warningsAsErrors;
            _logger = logger;
            _telemetry = new TelemetryRecorder(devtools, "2.0.4");
            _lifecycleResolver = lifecycleResolver ?? FetchModelLifecycleAsync;
            AsyncJobs = new AsyncJobsResource(this);
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
                response = await Operations.ListDataModelsAsync(
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

        public Task<Dictionary<string, object>?> CreateTranscription(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "audio.transcriptions",
                request,
                true,
                () => Operations.CreateTranscriptionAsync(_client, body: request));
        }

        public Task<Dictionary<string, object>?> CreateTranslation(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "audio.translations",
                request,
                true,
                () => Operations.CreateTranslationAsync(_client, body: request));
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

        public Task<Dictionary<string, object>?> ListTeamModels(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("models.team", query, false, () => Operations.ListTeamModelsAsync(_client, query: query));
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

        public Task<Dictionary<string, object>?> UploadFile(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry("files.upload", request, false, () => Operations.UploadFileAsync(_client, body: request));
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
                    => $"[ai-stats] Model \"{modelId}\" is retired as of {retirementDate}.{replacement}",
                "retired"
                    => $"[ai-stats] Model \"{modelId}\" is retired.{replacement}",
                "deprecated" when !string.IsNullOrWhiteSpace(retirementDate)
                    => $"[ai-stats] Model \"{modelId}\" is deprecated and scheduled for retirement on {retirementDate}.{replacement}",
                "deprecated" when !string.IsNullOrWhiteSpace(deprecationDate)
                    => $"[ai-stats] Model \"{modelId}\" has been deprecated since {deprecationDate}.{replacement}",
                "deprecated"
                    => $"[ai-stats] Model \"{modelId}\" is deprecated.{replacement}",
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
                return $"[ai-stats] Model \"{info.ModelId}\" is not active for inference.";
            }

            var sourceStatus = NormalizeSourceStatus(info.SourceStatus) ?? "unknown";
            var replacement = string.IsNullOrWhiteSpace(info.ReplacementModelId)
                ? string.Empty
                : $" Use \"{info.ReplacementModelId}\" instead.";
            return $"[ai-stats] Model \"{info.ModelId}\" is not active for inference (status: {sourceStatus}).{replacement}";
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
