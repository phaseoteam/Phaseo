using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;
using Phaseo.Gen;

namespace PhaseoSdk
{
    public sealed class DevtoolsConfig
    {
        public bool Enabled { get; init; } = true;
        public string? Directory { get; init; } = null;
        public bool CaptureHeaders { get; init; } = false;
        public bool SaveAssets { get; init; } = true;
    }

    public static class PhaseoDevtools
    {
        public static DevtoolsConfig Create(
            bool enabled = true,
            string? directory = null,
            bool captureHeaders = false,
            bool saveAssets = true)
        {
            return new DevtoolsConfig
            {
                Enabled = enabled,
                Directory = directory,
                CaptureHeaders = captureHeaders,
                SaveAssets = saveAssets
            };
        }
    }

    internal sealed class TelemetryRecorder
    {
        private static long _counter;

        private readonly bool _enabled;
        private readonly string _directory;
        private readonly bool _captureHeaders;
        private readonly bool _saveAssets;
        private readonly string _sdkVersion;
        private readonly object _sync = new();

        public TelemetryRecorder(DevtoolsConfig? config, string sdkVersion)
        {
            var enabled = config?.Enabled ?? false;
            var directory = string.IsNullOrWhiteSpace(config?.Directory)
                ? ".phaseo-devtools"
                : config!.Directory!;

            var envEnabled = Environment.GetEnvironmentVariable("PHASEO_DEVTOOLS");
            if (!string.IsNullOrWhiteSpace(envEnabled) && bool.TryParse(envEnabled, out var parsedEnabled))
            {
                enabled = parsedEnabled;
            }

            var envDirectory = Environment.GetEnvironmentVariable("PHASEO_DEVTOOLS_DIR");
            if (!string.IsNullOrWhiteSpace(envDirectory))
            {
                directory = envDirectory;
            }

            _enabled = enabled;
            _directory = directory;
            _captureHeaders = config?.CaptureHeaders ?? false;
            _saveAssets = config?.SaveAssets ?? true;
            _sdkVersion = sdkVersion;

            if (_enabled)
            {
                lock (_sync)
                {
                    EnsureLayout();
                    WriteMetadataIfMissing();
                }
            }
        }

        public void CaptureSuccess(string endpoint, object? request, object? response, long durationMs)
        {
            if (!_enabled)
            {
                return;
            }

            var metadata = new Dictionary<string, object?>
            {
                ["sdk"] = "csharp",
                ["sdk_version"] = _sdkVersion,
                ["stream"] = false
            };

            var usage = ExtractUsage(response);
            if (usage.Count > 0)
            {
                metadata["usage"] = usage;
            }

            var (model, provider) = ExtractModelProvider(response, request);
            if (!string.IsNullOrWhiteSpace(model))
            {
                metadata["model"] = model;
            }
            if (!string.IsNullOrWhiteSpace(provider))
            {
                metadata["provider"] = provider;
            }
            EnrichMetadataFromResponse(metadata, NormalizeToMap(response));
            if (!_captureHeaders)
            {
                metadata.Remove("headers");
            }

            var entry = new Dictionary<string, object?>
            {
                ["id"] = NewEntryId(),
                ["type"] = endpoint,
                ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                ["duration_ms"] = durationMs,
                ["request"] = Normalize(request),
                ["response"] = Normalize(response),
                ["error"] = null,
                ["metadata"] = metadata
            };

            AppendEntry(entry);
        }

        public void CaptureError(string endpoint, object? request, Exception ex, long durationMs)
        {
            if (!_enabled)
            {
                return;
            }

            var metadata = new Dictionary<string, object?>
            {
                ["sdk"] = "csharp",
                ["sdk_version"] = _sdkVersion,
                ["stream"] = false
            };
            var errorResponse = ExtractErrorResponse(ex);

            var (model, provider) = ExtractModelProvider(null, request);
            if (!string.IsNullOrWhiteSpace(model))
            {
                metadata["model"] = model;
            }
            if (!string.IsNullOrWhiteSpace(provider))
            {
                metadata["provider"] = provider;
            }
            EnrichMetadataFromResponse(metadata, errorResponse);
            var statusCode = ExtractErrorStatusCode(ex);

            var entry = new Dictionary<string, object?>
            {
                ["id"] = NewEntryId(),
                ["type"] = endpoint,
                ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                ["duration_ms"] = durationMs,
                ["request"] = Normalize(request),
                ["response"] = errorResponse.Count > 0 ? errorResponse : null,
                ["error"] = new Dictionary<string, object?>
                {
                    ["message"] = ex.Message,
                    ["status_code"] = statusCode
                },
                ["metadata"] = metadata
            };

            AppendEntry(entry);
        }

        private void AppendEntry(Dictionary<string, object?> entry)
        {
            lock (_sync)
            {
                EnsureLayout();
                var generationsPath = Path.Combine(_directory, "generations.jsonl");
                var json = JsonSerializer.Serialize(entry);
                File.AppendAllText(generationsPath, json + Environment.NewLine);
            }
        }

        private void EnsureLayout()
        {
            Directory.CreateDirectory(_directory);
            if (_saveAssets)
            {
                Directory.CreateDirectory(Path.Combine(_directory, "assets", "images"));
                Directory.CreateDirectory(Path.Combine(_directory, "assets", "audio"));
                Directory.CreateDirectory(Path.Combine(_directory, "assets", "video"));
            }
        }

        private void WriteMetadataIfMissing()
        {
            var metadataPath = Path.Combine(_directory, "metadata.json");
            if (File.Exists(metadataPath))
            {
                return;
            }

            var metadata = new Dictionary<string, object?>
            {
                ["session_id"] = NewEntryId(),
                ["started_at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                ["sdk"] = "csharp",
                ["sdk_version"] = _sdkVersion,
                ["platform"] = RuntimeInformation.OSDescription,
                ["dotnet_version"] = Environment.Version.ToString()
            };
            var json = JsonSerializer.Serialize(metadata, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(metadataPath, json);
        }

        private static object? Normalize(object? value)
        {
            if (value is null)
            {
                return null;
            }

            var json = JsonSerializer.Serialize(value);
            return JsonSerializer.Deserialize<object>(json);
        }

        private static Dictionary<string, object?> ExtractUsage(object? response)
        {
            var map = NormalizeToMap(response);
            if (!map.TryGetValue("usage", out var usageRaw))
            {
                return new Dictionary<string, object?>();
            }
            var usage = NormalizeToMap(usageRaw);

            var output = new Dictionary<string, object?>();
            var prompt = FirstNonNull(usage, "prompt_tokens", "input_tokens");
            var completion = FirstNonNull(usage, "completion_tokens", "output_tokens");
            var total = FirstNonNull(usage, "total_tokens");
            if (prompt is not null)
            {
                output["prompt_tokens"] = prompt;
            }
            if (completion is not null)
            {
                output["completion_tokens"] = completion;
            }
            if (total is not null)
            {
                output["total_tokens"] = total;
            }
            return output;
        }

        private static (string? model, string? provider) ExtractModelProvider(object? response, object? request)
        {
            var responseMap = NormalizeToMap(response);
            var requestMap = NormalizeToMap(request);

            var model = responseMap.TryGetValue("model", out var responseModel)
                ? responseModel?.ToString()
                : null;
            if (string.IsNullOrWhiteSpace(model) && requestMap.TryGetValue("model", out var requestModel))
            {
                model = requestModel?.ToString();
            }
            var provider = responseMap.TryGetValue("provider", out var responseProvider)
                ? responseProvider?.ToString()
                : null;
            return (TrimOrNull(model), TrimOrNull(provider));
        }

        private static Dictionary<string, object?> NormalizeToMap(object? value)
        {
            if (value is Dictionary<string, object?> typed)
            {
                return typed;
            }
            if (value is string text && !string.IsNullOrWhiteSpace(text))
            {
                try
                {
                    using var document = JsonDocument.Parse(text);
                    if (document.RootElement.ValueKind == JsonValueKind.Object)
                    {
                        return JsonSerializer.Deserialize<Dictionary<string, object?>>(document.RootElement.GetRawText())
                            ?? new Dictionary<string, object?>();
                    }
                }
                catch (JsonException)
                {
                }
            }
            var normalized = Normalize(value);
            if (normalized is Dictionary<string, object?> dict)
            {
                return dict;
            }
            if (normalized is JsonElement element && element.ValueKind == JsonValueKind.Object)
            {
                return JsonSerializer.Deserialize<Dictionary<string, object?>>(element.GetRawText())
                    ?? new Dictionary<string, object?>();
            }
            return new Dictionary<string, object?>();
        }

        private static Dictionary<string, object?> ExtractErrorResponse(Exception error)
        {
            if (error is ApiErrorException apiError)
            {
                var parsed = NormalizeToMap(apiError.ResponseBody);
                if (parsed.Count > 0)
                {
                    return parsed;
                }

                var fallback = new Dictionary<string, object?>
                {
                    ["status_code"] = apiError.StatusCode
                };
                if (!string.IsNullOrWhiteSpace(apiError.ResponseBody))
                {
                    fallback["error"] = apiError.ResponseBody.Trim();
                }
                return fallback;
            }

            return new Dictionary<string, object?>();
        }

        private static int? ExtractErrorStatusCode(Exception error)
        {
            return error is ApiErrorException apiError ? apiError.StatusCode : null;
        }

        private static void EnrichMetadataFromResponse(Dictionary<string, object?> metadata, Dictionary<string, object?> payload)
        {
            if (payload.Count == 0)
            {
                return;
            }

            foreach (var key in new[]
            {
                "request_id",
                "session_id",
                "upstream_request_id",
                "native_response_id",
                "status_code",
                "latency_ms",
                "generation_ms",
                "throughput",
                "provider_attempts",
                "pricing_lines",
                "request_counts",
                "billing"
            })
            {
                if (payload.TryGetValue(key, out var value) && value is not null)
                {
                    metadata[key] = value;
                }
            }

            var finishReason = FirstNonNull(payload, "finish_reason", "stop_reason");
            if (finishReason is not null)
            {
                metadata["finish_reason"] = finishReason;
            }
        }

        private static object? FirstNonNull(Dictionary<string, object?> source, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (source.TryGetValue(key, out var value) && value is not null)
                {
                    return value;
                }
            }
            return null;
        }

        private static string? TrimOrNull(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }
            return value.Trim();
        }

        private static string NewEntryId()
        {
            var suffix = Interlocked.Increment(ref _counter);
            return $"{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{suffix}";
        }
    }
}
