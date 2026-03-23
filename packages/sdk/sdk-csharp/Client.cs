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

    public sealed class ModelLifecycleInfo
    {
        public required string ModelId { get; init; }
        public required string Status { get; init; }
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
        private readonly HashSet<string> _warnedModels = new(StringComparer.Ordinal);
        private readonly Dictionary<string, ModelLifecycleInfo?> _lifecycleCache = new(StringComparer.Ordinal);

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
            _client = new AiStats.Gen.Client(basePath, httpClient, headers: headers);
            _enableDeprecationWarnings = enableDeprecationWarnings;
            _warningsAsErrors = warningsAsErrors;
            _logger = logger;
            _telemetry = new TelemetryRecorder(devtools, "1.0.1");
            _lifecycleResolver = lifecycleResolver ?? FetchModelLifecycleAsync;
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

            if (string.Equals(info.Status, "retired", StringComparison.Ordinal))
            {
                return new Dictionary<string, object?>
                {
                    ["ok"] = false,
                    ["info"] = info,
                    ["reason"] = info.Message ?? $"Model \"{modelId}\" is retired."
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

            await MaybeWarnForModel(modelId).ConfigureAwait(false);
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
            if (lifecycle is null || lifecycle.Status == "active")
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

        public Task<object?> CreateBatch(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry(
                "batches.create",
                request,
                true,
                () => Operations.CreateBatchAsync(_client, body: request));
        }

        public Task<object?> RetrieveBatch(string batchId)
        {
            return WithLifecycleAndTelemetry(
                "batches.retrieve",
                new Dictionary<string, object> { ["batch_id"] = batchId },
                false,
                () => Operations.RetrieveBatchAsync(_client, path: new Dictionary<string, string> { { "batch_id", batchId } }));
        }

        public Task<Dictionary<string, object>?> ListModels(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("models.list", query, false, () => Operations.ListModelsAsync(_client, query: query));
        }

        public Task<Dictionary<string, object>?> ListProviders(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("providers", query, false, () => Operations.ListProvidersAsync(_client, query: query));
        }

        public Task<Dictionary<string, object>?> GetAnalytics(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("analytics", query, false, () => Operations.GetAnalyticsAsync(_client, query: query));
        }

        public Task<Dictionary<string, object>?> GetCredits(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("credits", query, false, () => Operations.GetCreditsAsync(_client, query: query));
        }

        public Task<Dictionary<string, object>?> GetActivity(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("activity", query, false, () => Operations.GetActivityAsync(_client, query: query));
        }

        public Task<object?> ListFiles(Dictionary<string, string>? query = null)
        {
            return WithLifecycleAndTelemetry("files.list", query, false, () => Operations.ListFilesAsync(_client, query: query));
        }

        public Task<object?> RetrieveFile(string fileId)
        {
            return WithLifecycleAndTelemetry(
                "files.retrieve",
                new Dictionary<string, object> { ["file_id"] = fileId },
                false,
                () => Operations.RetrieveFileAsync(_client, path: new Dictionary<string, string> { { "file_id", fileId } }));
        }

        public Task<object?> UploadFile(Dictionary<string, object> request)
        {
            return WithLifecycleAndTelemetry("files.upload", request, false, () => Operations.UploadFileAsync(_client, body: request));
        }

        public Task<Dictionary<string, object>?> Health()
        {
            return WithLifecycleAndTelemetry("health", null, false, () => Operations.HealthzAsync(_client));
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
    }
}
