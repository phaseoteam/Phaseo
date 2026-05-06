package ai.stats.sdk;

import ai.stats.gen.Client.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

final class TelemetryRecorder {
	private static final AtomicLong COUNTER = new AtomicLong(0L);

	private final boolean enabled;
	private final String directory;
	private final boolean captureHeaders;
	private final boolean saveAssets;
	private final String sdkVersion;
	private final ObjectMapper mapper = new ObjectMapper();

	TelemetryRecorder(DevtoolsConfig config, String sdkVersion) {
		boolean enabledValue = config != null ? config.enabled : false;
		String directoryValue = config != null && config.directory != null && !config.directory.isBlank()
			? config.directory
			: ".ai-stats-devtools";
		boolean captureHeadersValue = config != null && config.captureHeaders;
		boolean saveAssetsValue = config == null || config.saveAssets;

		String envEnabled = System.getenv("AI_STATS_DEVTOOLS");
		if (envEnabled != null && !envEnabled.isBlank()) {
			String normalized = envEnabled.trim().toLowerCase(Locale.ROOT);
			enabledValue = normalized.equals("1")
				|| normalized.equals("true")
				|| normalized.equals("yes")
				|| normalized.equals("on");
		}

		String envDirectory = System.getenv("AI_STATS_DEVTOOLS_DIR");
		if (envDirectory != null && !envDirectory.isBlank()) {
			directoryValue = envDirectory.trim();
		}

		this.enabled = enabledValue;
		this.directory = directoryValue;
		this.captureHeaders = captureHeadersValue;
		this.saveAssets = saveAssetsValue;
		this.sdkVersion = sdkVersion;

		if (this.enabled) {
			synchronized (this) {
				try {
					ensureLayout();
					writeMetadataIfMissing();
				} catch (IOException ignored) {
				}
			}
		}
	}

	void captureSuccess(String endpoint, Object request, Object response, long durationMs) {
		if (!enabled) {
			return;
		}

		Map<String, Object> metadata = new HashMap<>();
		metadata.put("sdk", "java");
		metadata.put("sdk_version", sdkVersion);
		metadata.put("stream", false);

		Map<String, Object> usage = extractUsage(response);
		if (!usage.isEmpty()) {
			metadata.put("usage", usage);
		}

		Map<String, String> modelProvider = extractModelProvider(response, request);
		if (modelProvider.get("model") != null) {
			metadata.put("model", modelProvider.get("model"));
		}
		if (modelProvider.get("provider") != null) {
			metadata.put("provider", modelProvider.get("provider"));
		}
		enrichMetadataFromResponse(metadata, toMap(response));
		if (!captureHeaders) {
			metadata.remove("headers");
		}

		Map<String, Object> entry = new HashMap<>();
		entry.put("id", newEntryId());
		entry.put("type", endpoint);
		entry.put("timestamp", Instant.now().toEpochMilli());
		entry.put("duration_ms", durationMs);
		entry.put("request", normalize(request));
		entry.put("response", normalize(response));
		entry.put("error", null);
		entry.put("metadata", metadata);

		appendEntry(entry);
	}

	void captureError(String endpoint, Object request, Exception error, long durationMs) {
		if (!enabled) {
			return;
		}

		Map<String, Object> metadata = new HashMap<>();
		metadata.put("sdk", "java");
		metadata.put("sdk_version", sdkVersion);
		metadata.put("stream", false);
		Map<String, Object> errorResponse = extractErrorResponse(error);

		Map<String, String> modelProvider = extractModelProvider(null, request);
		if (modelProvider.get("model") != null) {
			metadata.put("model", modelProvider.get("model"));
		}
		if (modelProvider.get("provider") != null) {
			metadata.put("provider", modelProvider.get("provider"));
		}
		enrichMetadataFromResponse(metadata, errorResponse);

		Map<String, Object> errorInfo = new HashMap<>();
		errorInfo.put("message", error.getMessage());
		Integer statusCode = extractErrorStatusCode(error);
		if (statusCode != null) {
			errorInfo.put("status_code", statusCode);
		}

		Map<String, Object> entry = new HashMap<>();
		entry.put("id", newEntryId());
		entry.put("type", endpoint);
		entry.put("timestamp", Instant.now().toEpochMilli());
		entry.put("duration_ms", durationMs);
		entry.put("request", normalize(request));
		entry.put("response", errorResponse.isEmpty() ? null : errorResponse);
		entry.put("error", errorInfo);
		entry.put("metadata", metadata);

		appendEntry(entry);
	}

	private synchronized void appendEntry(Map<String, Object> entry) {
		try {
			ensureLayout();
			Path generations = Path.of(directory, "generations.jsonl");
			String line = mapper.writeValueAsString(entry) + System.lineSeparator();
			Files.writeString(
				generations,
				line,
				StandardCharsets.UTF_8,
				StandardOpenOption.CREATE,
				StandardOpenOption.APPEND
			);
		} catch (IOException ignored) {
		}
	}

	private void ensureLayout() throws IOException {
		Files.createDirectories(Path.of(directory));
		if (saveAssets) {
			Files.createDirectories(Path.of(directory, "assets", "images"));
			Files.createDirectories(Path.of(directory, "assets", "audio"));
			Files.createDirectories(Path.of(directory, "assets", "video"));
		}
	}

	private void writeMetadataIfMissing() {
		try {
			Path metadataPath = Path.of(directory, "metadata.json");
			if (Files.exists(metadataPath)) {
				return;
			}
			Map<String, Object> metadata = new HashMap<>();
			metadata.put("session_id", newEntryId());
			metadata.put("started_at", Instant.now().toEpochMilli());
			metadata.put("sdk", "java");
			metadata.put("sdk_version", sdkVersion);
			metadata.put("platform", System.getProperty("os.name"));
			metadata.put("java_version", System.getProperty("java.version"));
			Files.writeString(
				metadataPath,
				mapper.writerWithDefaultPrettyPrinter().writeValueAsString(metadata),
				StandardCharsets.UTF_8,
				StandardOpenOption.CREATE_NEW
			);
		} catch (IOException ignored) {
		}
	}

	private Object normalize(Object value) {
		if (value == null) {
			return null;
		}
		if (value instanceof JsonNode node) {
			return mapper.convertValue(node, Object.class);
		}
		return mapper.convertValue(value, Object.class);
	}

	@SuppressWarnings("unchecked")
	private Map<String, Object> toMap(Object value) {
		if (value instanceof String text && !text.isBlank()) {
			try {
				JsonNode parsed = mapper.readTree(text);
				if (parsed.isObject()) {
					return mapper.convertValue(parsed, Map.class);
				}
			} catch (IOException ignored) {
			}
		}
		Object normalized = normalize(value);
		if (normalized instanceof Map<?, ?> map) {
			return (Map<String, Object>) map;
		}
		return new HashMap<>();
	}

	private Map<String, Object> extractUsage(Object response) {
		Map<String, Object> responseMap = toMap(response);
		Object usageRaw = responseMap.get("usage");
		if (!(usageRaw instanceof Map<?, ?>)) {
			return new HashMap<>();
		}

		Map<String, Object> usage = toMap(usageRaw);
		Map<String, Object> output = new HashMap<>();
		Object prompt = firstNonNull(usage, "prompt_tokens", "input_tokens");
		Object completion = firstNonNull(usage, "completion_tokens", "output_tokens");
		Object total = firstNonNull(usage, "total_tokens");
		if (prompt != null) {
			output.put("prompt_tokens", prompt);
		}
		if (completion != null) {
			output.put("completion_tokens", completion);
		}
		if (total != null) {
			output.put("total_tokens", total);
		}
		return output;
	}

	private Map<String, String> extractModelProvider(Object response, Object request) {
		Map<String, Object> responseMap = toMap(response);
		Map<String, Object> requestMap = toMap(request);

		String model = asTrimmedString(responseMap.get("model"));
		if (model == null) {
			model = asTrimmedString(requestMap.get("model"));
		}
		String provider = asTrimmedString(responseMap.get("provider"));

		Map<String, String> output = new HashMap<>();
		output.put("model", model);
		output.put("provider", provider);
		return output;
	}

	private Map<String, Object> extractErrorResponse(Exception error) {
		if (error instanceof ApiException apiError) {
			Map<String, Object> parsed = toMap(apiError.getResponseBody());
			if (!parsed.isEmpty()) {
				return parsed;
			}

			Map<String, Object> fallback = new HashMap<>();
			fallback.put("status_code", apiError.getStatusCode());
			String body = asTrimmedString(apiError.getResponseBody());
			if (body != null) {
				fallback.put("error", body);
			}
			return fallback;
		}

		return new HashMap<>();
	}

	private Integer extractErrorStatusCode(Exception error) {
		if (error instanceof ApiException apiError) {
			return apiError.getStatusCode();
		}
		return null;
	}

	private void enrichMetadataFromResponse(Map<String, Object> metadata, Map<String, Object> payload) {
		if (payload.isEmpty()) {
			return;
		}

		for (String key : new String[] {
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
		}) {
			Object value = payload.get(key);
			if (value != null) {
				metadata.put(key, value);
			}
		}

		Object finishReason = firstNonNull(payload, "finish_reason", "stop_reason");
		if (finishReason != null) {
			metadata.put("finish_reason", finishReason);
		}
	}

	private static Object firstNonNull(Map<String, Object> source, String... keys) {
		for (String key : keys) {
			Object value = source.get(key);
			if (value != null) {
				return value;
			}
		}
		return null;
	}

	private static String asTrimmedString(Object value) {
		if (value == null) {
			return null;
		}
		String text = String.valueOf(value).trim();
		return text.isEmpty() ? null : text;
	}

	private static String newEntryId() {
		long suffix = COUNTER.incrementAndGet();
		return Instant.now().toEpochMilli() + "-" + suffix;
	}
}
