package ai.stats.sdk;

import ai.stats.gen.Client;
import ai.stats.gen.Operations;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.TextNode;
import java.io.IOException;
import java.net.http.HttpClient;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

public final class AIStats {
	public interface AIStatsLogger {
		void log(String level, String message, Map<String, Object> meta);
	}

	public interface ModelLifecycleResolver {
		ModelLifecycleInfo resolve(String modelId) throws IOException, InterruptedException;
	}

	public static final class ModelLifecycleInfo {
		public final String modelId;
		public final String status;
		public final String deprecationDate;
		public final String retirementDate;
		public final String replacementModelId;
		public final String message;

		public ModelLifecycleInfo(
			String modelId,
			String status,
			String deprecationDate,
			String retirementDate,
			String replacementModelId,
			String message
		) {
			this.modelId = modelId;
			this.status = status;
			this.deprecationDate = deprecationDate;
			this.retirementDate = retirementDate;
			this.replacementModelId = replacementModelId;
			this.message = message;
		}
	}

	private static final ObjectMapper MAPPER = new ObjectMapper();
	private static final String DEFAULT_BASE_URL = "https://api.phaseo.app/v1";
	private final Client rawClient;
	private final boolean enableDeprecationWarnings;
	private final boolean warningsAsErrors;
	private final AIStatsLogger logger;
	private final TelemetryRecorder telemetry;
	private final ModelLifecycleResolver lifecycleResolver;
	private final Set<String> warnedModels = new HashSet<>();
	private final Map<String, ModelLifecycleInfo> lifecycleCache = new HashMap<>();

	public AIStats() {
		this(resolveApiKey(null), DEFAULT_BASE_URL);
	}

	public AIStats(String apiKey) {
		this(apiKey, DEFAULT_BASE_URL);
	}

	public AIStats(String apiKey, String basePath) {
		this(apiKey, basePath, true, false, null, null, null, null);
	}

	public AIStats(
		String apiKey,
		String basePath,
		boolean enableDeprecationWarnings,
		boolean warningsAsErrors,
		AIStatsLogger logger
	) {
		this(apiKey, basePath, enableDeprecationWarnings, warningsAsErrors, logger, null, null, null);
	}

	public AIStats(
		String apiKey,
		String basePath,
		boolean enableDeprecationWarnings,
		boolean warningsAsErrors,
		AIStatsLogger logger,
		DevtoolsConfig devtoolsConfig
	) {
		this(apiKey, basePath, enableDeprecationWarnings, warningsAsErrors, logger, null, null, devtoolsConfig);
	}

	public AIStats(
		String apiKey,
		String basePath,
		boolean enableDeprecationWarnings,
		boolean warningsAsErrors,
		AIStatsLogger logger,
		ModelLifecycleResolver lifecycleResolver,
		HttpClient httpClient,
		DevtoolsConfig devtoolsConfig
	) {
		String resolvedApiKey = resolveApiKey(apiKey);
		Map<String, String> headers = new HashMap<>();
		headers.put("Authorization", "Bearer " + resolvedApiKey);
		this.rawClient = new Client(
			basePath,
			httpClient == null ? java.net.http.HttpClient.newHttpClient() : httpClient,
			headers
		);
		this.enableDeprecationWarnings = enableDeprecationWarnings;
		this.warningsAsErrors = warningsAsErrors;
		this.logger = logger;
		this.telemetry = new TelemetryRecorder(devtoolsConfig, "1.0.1");
		this.lifecycleResolver = lifecycleResolver == null ? this::fetchModelLifecycle : lifecycleResolver;
	}

	public Client rawClient() {
		return rawClient;
	}

	public JsonNode request(
		String method,
		String path,
		Map<String, String> query,
		Map<String, String> headers,
		Object body
	) throws IOException, InterruptedException {
		String payload = body == null ? null : MAPPER.writeValueAsString(body);
		String raw = rawClient.request(method, path, query, headers, payload);
		return parse(raw);
	}

	public ModelLifecycleInfo getModelDeprecationInfo(String modelId) throws IOException, InterruptedException {
		String normalized = asTrimmedString(modelId);
		if (normalized == null) {
			return null;
		}
		if (lifecycleCache.containsKey(normalized)) {
			return lifecycleCache.get(normalized);
		}
		ModelLifecycleInfo resolved = lifecycleResolver.resolve(normalized);
		lifecycleCache.put(normalized, resolved);
		return resolved;
	}

	public Map<String, Object> validateModel(String modelId) throws IOException, InterruptedException {
		ModelLifecycleInfo info = getModelDeprecationInfo(modelId);
		Map<String, Object> out = new HashMap<>();
		if (info == null) {
			out.put("ok", true);
			out.put("info", null);
			return out;
		}
		if ("retired".equals(info.status)) {
			out.put("ok", false);
			out.put("info", info);
			out.put("reason", info.message != null ? info.message : "Model \"" + modelId + "\" is retired.");
			return out;
		}
		out.put("ok", true);
		out.put("info", info);
		return out;
	}

	public JsonNode createChatCompletion(Object request) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"chat.completions",
			request,
			true,
			() -> parse(Operations.createChatCompletion(rawClient, null, null, null, stringify(request)))
		);
	}

	public JsonNode createResponse(Object request) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"responses",
			request,
			true,
			() -> parse(Operations.createResponse(rawClient, null, null, null, stringify(request)))
		);
	}

	public JsonNode createAnthropicMessage(Object request) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"messages",
			request,
			true,
			() -> parse(Operations.createAnthropicMessage(rawClient, null, null, null, stringify(request)))
		);
	}

	public JsonNode createEmbedding(Object request) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"embeddings",
			request,
			true,
			() -> parse(Operations.createEmbedding(rawClient, null, null, null, stringify(request)))
		);
	}

	public JsonNode createImage(Object request) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"images.generations",
			request,
			true,
			() -> parse(Operations.createImage(rawClient, null, null, null, stringify(request)))
		);
	}

	public JsonNode createImageEdit(Object request) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"images.edits",
			request,
			true,
			() -> parse(Operations.createImageEdit(rawClient, null, null, null, stringify(request)))
		);
	}

	public JsonNode createModeration(Object request) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"moderations",
			request,
			true,
			() -> parse(Operations.createModeration(rawClient, null, null, null, stringify(request)))
		);
	}

	public JsonNode createSpeech(Object request) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"audio.speech",
			request,
			true,
			() -> parse(Operations.createSpeech(rawClient, null, null, null, stringify(request)))
		);
	}

	public JsonNode createTranscription(Object request) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"audio.transcriptions",
			request,
			true,
			() -> parse(Operations.createTranscription(rawClient, null, null, null, stringify(request)))
		);
	}

	public JsonNode createTranslation(Object request) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"audio.translations",
			request,
			true,
			() -> parse(Operations.createTranslation(rawClient, null, null, null, stringify(request)))
		);
	}

	public JsonNode createBatch(Object request) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"batches.create",
			request,
			true,
			() -> parse(Operations.createBatch(rawClient, null, null, null, stringify(request)))
		);
	}

	public JsonNode retrieveBatch(String batchId) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"batches.retrieve",
			Map.of("batch_id", batchId),
			false,
			() -> {
				Map<String, String> path = new HashMap<>();
				path.put("batch_id", batchId);
				return parse(Operations.retrieveBatch(rawClient, path, null, null, null));
			}
		);
	}

	public JsonNode listModels(Map<String, String> query) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry("models.list", query, false, () -> parse(Operations.listModels(rawClient, null, query, null, null)));
	}

	public JsonNode listProviders(Map<String, String> query) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry("providers", query, false, () -> parse(Operations.listProviders(rawClient, null, query, null, null)));
	}

	public JsonNode getAnalytics(Map<String, String> query) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry("analytics", query, false, () -> parse(Operations.getAnalytics(rawClient, null, query, null, null)));
	}

	public JsonNode getCredits(Map<String, String> query) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry("credits", query, false, () -> parse(Operations.getCredits(rawClient, null, query, null, null)));
	}

	public JsonNode getActivity(Map<String, String> query) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry("activity", query, false, () -> parse(Operations.getActivity(rawClient, null, query, null, null)));
	}

	public JsonNode listFiles(Map<String, String> query) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry("files.list", query, false, () -> parse(Operations.listFiles(rawClient, null, query, null, null)));
	}

	public JsonNode retrieveFile(String fileId) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"files.retrieve",
			Map.of("file_id", fileId),
			false,
			() -> {
				Map<String, String> path = new HashMap<>();
				path.put("file_id", fileId);
				return parse(Operations.retrieveFile(rawClient, path, null, null, null));
			}
		);
	}

	public JsonNode uploadFile(Object request) throws IOException, InterruptedException {
		return withLifecycleAndTelemetry(
			"files.upload",
			request,
			false,
			() -> parse(Operations.uploadFile(rawClient, null, null, null, stringify(request)))
		);
	}

	public JsonNode healthz() throws IOException, InterruptedException {
		return withLifecycleAndTelemetry("health", null, false, () -> parse(Operations.healthz(rawClient, null, null, null, null)));
	}

	private void maybeWarnForPayload(Object payload) throws IOException, InterruptedException {
		String modelId = extractModelIdFromPayload(payload);
		if (modelId == null) {
			return;
		}
		maybeWarnForModel(modelId);
	}

	private void maybeWarnForModel(String modelId) throws IOException, InterruptedException {
		if (!enableDeprecationWarnings) {
			return;
		}
		String normalized = asTrimmedString(modelId);
		if (normalized == null) {
			return;
		}

		ModelLifecycleInfo lifecycle = getModelDeprecationInfo(normalized);
		if (lifecycle == null || "active".equals(lifecycle.status)) {
			return;
		}

		String message =
			lifecycle.message == null
				? buildLifecycleMessage(
					lifecycle.status,
					lifecycle.modelId,
					lifecycle.deprecationDate,
					lifecycle.retirementDate,
					lifecycle.replacementModelId
				)
				: lifecycle.message;

		if (warningsAsErrors) {
			throw new IllegalStateException(message);
		}

		if (warnedModels.contains(normalized)) {
			return;
		}
		warnedModels.add(normalized);

		Map<String, Object> meta = new HashMap<>();
		meta.put("model_id", lifecycle.modelId);
		meta.put("status", lifecycle.status);
		meta.put("deprecation_date", lifecycle.deprecationDate);
		meta.put("retirement_date", lifecycle.retirementDate);
		meta.put("replacement_model_id", lifecycle.replacementModelId);

		if (logger != null) {
			logger.log("warn", message, meta);
			return;
		}
		System.err.println(message);
	}

	private ModelLifecycleInfo fetchModelLifecycle(String modelId) throws IOException, InterruptedException {
		Map<String, String> query = new HashMap<>();
		query.put("model_id", modelId);
		query.put("limit", "1");
		JsonNode response = parse(Operations.listDataModels(rawClient, null, query, null, null));
		JsonNode models = response.path("models");
		if (!models.isArray()) {
			return null;
		}
		Iterator<JsonNode> it = models.elements();
		while (it.hasNext()) {
			JsonNode model = it.next();
			String candidate = asTrimmedString(model.path("model_id").asText(null));
			if (candidate == null || !candidate.equals(modelId)) {
				continue;
			}
			return toModelLifecycleInfo(model, modelId);
		}
		return null;
	}

	private static ModelLifecycleInfo toModelLifecycleInfo(JsonNode model, String fallbackModelId) {
		JsonNode lifecycle = model.path("lifecycle");
		String modelId = firstNonEmpty(
			asTrimmedString(model.path("model_id").asText(null)),
			fallbackModelId
		);
		String deprecationDate = firstNonEmpty(
			asTrimmedString(lifecycle.path("deprecation_date").asText(null)),
			asTrimmedString(model.path("deprecation_date").asText(null))
		);
		String retirementDate = firstNonEmpty(
			asTrimmedString(lifecycle.path("retirement_date").asText(null)),
			asTrimmedString(model.path("retirement_date").asText(null))
		);
		String status = normalizeLifecycleStatus(
			firstNonEmpty(
				asTrimmedString(lifecycle.path("status").asText(null)),
				asTrimmedString(model.path("status").asText(null))
			),
			deprecationDate,
			retirementDate
		);
		String replacement = firstNonEmpty(asTrimmedString(lifecycle.path("replacement_model_id").asText(null)));
		String message = firstNonEmpty(
			asTrimmedString(lifecycle.path("message").asText(null)),
			buildLifecycleMessage(status, modelId, deprecationDate, retirementDate, replacement)
		);
		return new ModelLifecycleInfo(modelId, status, deprecationDate, retirementDate, replacement, message);
	}

	private static String normalizeLifecycleStatus(String status, String deprecationDate, String retirementDate) {
		String normalized = firstNonEmpty(status);
		if (normalized != null) {
			String lower = normalized.toLowerCase();
			if (lower.equals("active") || lower.equals("deprecated") || lower.equals("retired")) {
				return lower;
			}
		}
		Instant now = Instant.now();
		Instant retirementAt = parseIsoInstant(retirementDate);
		if (retirementAt != null && !retirementAt.isAfter(now)) {
			return "retired";
		}
		Instant deprecationAt = parseIsoInstant(deprecationDate);
		if (deprecationAt != null && !deprecationAt.isAfter(now)) {
			return "deprecated";
		}
		return "active";
	}

	private static Instant parseIsoInstant(String value) {
		if (value == null || value.isBlank()) {
			return null;
		}
		try {
			return Instant.parse(value);
		} catch (DateTimeParseException ignored) {
			return null;
		}
	}

	private static String buildLifecycleMessage(
		String status,
		String modelId,
		String deprecationDate,
		String retirementDate,
		String replacementModelId
	) {
		String replacement = replacementModelId == null ? "" : " Use \"" + replacementModelId + "\" instead.";
		if ("retired".equals(status)) {
			if (retirementDate != null) {
				return "[ai-stats] Model \"" + modelId + "\" is retired as of " + retirementDate + "." + replacement;
			}
			return "[ai-stats] Model \"" + modelId + "\" is retired." + replacement;
		}
		if ("deprecated".equals(status)) {
			if (retirementDate != null) {
				return "[ai-stats] Model \"" + modelId + "\" is deprecated and scheduled for retirement on " + retirementDate + "." + replacement;
			}
			if (deprecationDate != null) {
				return "[ai-stats] Model \"" + modelId + "\" has been deprecated since " + deprecationDate + "." + replacement;
			}
			return "[ai-stats] Model \"" + modelId + "\" is deprecated." + replacement;
		}
		return "";
	}

	private static String extractModelIdFromPayload(Object payload) {
		if (payload == null) {
			return null;
		}
		JsonNode node = MAPPER.valueToTree(payload);
		if (!node.isObject()) {
			return null;
		}
		return asTrimmedString(node.path("model").asText(null));
	}

	private static String stringify(Object payload) throws JsonProcessingException {
		return payload == null ? null : MAPPER.writeValueAsString(payload);
	}

	private static JsonNode parse(Object raw) throws JsonProcessingException {
		if (raw == null) {
			return NullNode.getInstance();
		}
		if (!(raw instanceof String)) {
			return MAPPER.valueToTree(raw);
		}
		String text = (String) raw;
		if (text.isEmpty()) {
			return NullNode.getInstance();
		}
		try {
			return MAPPER.readTree(text);
		} catch (JsonProcessingException ignored) {
			return TextNode.valueOf(text);
		}
	}

	private static String firstNonEmpty(String... values) {
		if (values == null) {
			return null;
		}
		for (String value : values) {
			if (value != null && !value.isBlank()) {
				return value.trim();
			}
		}
		return null;
	}

	private static String asTrimmedString(String value) {
		if (value == null || value.isBlank()) {
			return null;
		}
		return value.trim();
	}

	private static String resolveApiKey(String explicitApiKey) {
		String key = explicitApiKey;
		if (key == null || key.isBlank()) {
			key = System.getenv("AI_STATS_API_KEY");
		}
		if (key == null || key.isBlank()) {
			throw new IllegalStateException("Missing API key. Pass apiKey or set AI_STATS_API_KEY.");
		}
		return key;
	}

	private interface Operation<T> {
		T run() throws IOException, InterruptedException;
	}

	private <T> T withLifecycleAndTelemetry(
		String endpoint,
		Object payload,
		boolean checkLifecycle,
		Operation<T> operation
	) throws IOException, InterruptedException {
		long startedAt = System.nanoTime();
		try {
			if (checkLifecycle) {
				maybeWarnForPayload(payload);
			}
			T result = operation.run();
			long durationMs = (System.nanoTime() - startedAt) / 1_000_000L;
			telemetry.captureSuccess(endpoint, payload, result, durationMs);
			return result;
		} catch (IOException | InterruptedException ex) {
			long durationMs = (System.nanoTime() - startedAt) / 1_000_000L;
			telemetry.captureError(endpoint, payload, ex, durationMs);
			throw ex;
		} catch (RuntimeException ex) {
			long durationMs = (System.nanoTime() - startedAt) / 1_000_000L;
			telemetry.captureError(endpoint, payload, ex, durationMs);
			throw ex;
		}
	}
}
