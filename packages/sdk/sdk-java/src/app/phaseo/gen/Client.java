package app.phaseo.gen;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Stream;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

public class Client {
	public static final class RequestOptions {
		public Duration timeout;
		public Integer maxRetries;
		public Map<String, String> headers;
		public String idempotencyKey;
	}

	public static final class RequestEvent {
		public final String method; public final String url; public final int attempt; public final String idempotencyKey; public final long startedAtMillis;
		RequestEvent(String method, String url, int attempt, String idempotencyKey) { this.method = method; this.url = url; this.attempt = attempt; this.idempotencyKey = idempotencyKey; this.startedAtMillis = System.currentTimeMillis(); }
	}

	public static final class ResponseEvent {
		public final RequestEvent request; public final int statusCode; public final String requestId; public final long elapsedMillis;
		ResponseEvent(RequestEvent request, int statusCode, String requestId, long elapsedMillis) { this.request = request; this.statusCode = statusCode; this.requestId = requestId; this.elapsedMillis = elapsedMillis; }
	}

	public static final class RetryEvent {
		public final RequestEvent request; public final Integer statusCode; public final long delayMillis; public final Exception error;
		RetryEvent(RequestEvent request, Integer statusCode, long delayMillis, Exception error) { this.request = request; this.statusCode = statusCode; this.delayMillis = delayMillis; this.error = error; }
	}

	public static final class RawResponse<T> {
		public final int statusCode; public final Map<String, List<String>> headers; public final T data;
		RawResponse(int statusCode, Map<String, List<String>> headers, T data) { this.statusCode = statusCode; this.headers = headers; this.data = data; }
		public String requestId() { return firstHeader(headers, "x-request-id", "x-phaseo-request-id"); }
		public String traceUrl() { String id = requestId(); return id == null ? null : "https://phaseo.app/settings/usage/logs/requests/" + URLEncoder.encode(id, StandardCharsets.UTF_8).replace("+", "%20"); }
	}

	private final String baseUrl;
	private final HttpClient http;
	private final Map<String, String> headers;
	private Duration timeout = Duration.ofSeconds(60);
	private int maxRetries = 0;
	private Consumer<RequestEvent> onRequest;
	private Consumer<ResponseEvent> onResponse;
	private Consumer<RetryEvent> onRetry;

	public static final class ApiException extends IOException {
		private final int statusCode;
		private final String responseBody;
		private final Map<String, List<String>> headers;
		private final Map<String, Object> payload;
		private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

		public ApiException(int statusCode, String responseBody, Map<String, List<String>> headers, String message) {
			super(message);
			this.statusCode = statusCode;
			this.responseBody = responseBody;
			this.headers = headers == null ? Collections.emptyMap() : headers;
			this.payload = parsePayload(responseBody);
		}

		public ApiException(int statusCode, String responseBody, Map<String, List<String>> headers) {
			this(statusCode, responseBody, headers, responseBody == null || responseBody.isBlank() ? "Request failed: " + statusCode : "Request failed: " + statusCode + ": " + responseBody);
		}

		public int getStatusCode() {
			return statusCode;
		}

		public String getResponseBody() {
			return responseBody;
		}

		public Map<String, List<String>> getHeaders() { return headers; }
		public Map<String, Object> getPayload() { return payload; }
		public String getRequestId() { return payloadString("request_id", firstHeader(headers, "x-request-id", "x-phaseo-request-id")); }
		public String getGenerationId() { return payloadString("generation_id", getRequestId()); }
		public String getErrorType() { return payloadString("error_type", null); }
		public String getErrorOrigin() { return payloadString("error_origin", null); }
		public Boolean getRetryable() { Object value = payload.get("retryable"); return value instanceof Boolean booleanValue ? booleanValue : null; }
		public String getAction() { return payloadString("action", null); }
		public String getDocsUrl() { return payloadString("docs_url", null); }
		public String getSupportUrl() { return payloadString("support_url", null); }
		public Long getRetryAfterSeconds() { Object value = payload.get("retry_after_seconds"); if (value instanceof Number number) return number.longValue(); Long millis = getRetryAfterMillis(); return millis == null ? null : (millis + 999) / 1000; }
		public Object getDetails() { return payload.get("details"); }
		public String getTraceUrl() { String id = getRequestId(); return id == null ? null : "https://phaseo.app/settings/usage/logs/requests/" + URLEncoder.encode(id, StandardCharsets.UTF_8).replace("+", "%20"); }
		public String getCode() { java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\"code\"\\s*:\s*\"([^\"]+)\"").matcher(responseBody == null ? "" : responseBody); return matcher.find() ? matcher.group(1) : null; }
		public Long getRetryAfterMillis() { return parseRetryAfter(firstHeader(headers, "retry-after")); }
		private String payloadString(String name, String fallback) { Object value = payload.get(name); return value instanceof String text ? text : fallback; }
		private static Map<String, Object> parsePayload(String body) { if (body == null || body.isBlank()) return Collections.emptyMap(); try { return OBJECT_MAPPER.readValue(body, new TypeReference<Map<String, Object>>() {}); } catch (Exception ignored) { return Collections.emptyMap(); } }
	}

	public Client(String baseUrl) {
		this(baseUrl, HttpClient.newHttpClient(), new HashMap<>());
	}

	public Client(String baseUrl, HttpClient http, Map<String, String> headers) {
		this.baseUrl = baseUrl.replaceAll("/+$", "");
		this.http = http;
		this.headers = headers;
	}

	public Client setTimeout(Duration value) { if (value == null || value.isNegative() || value.isZero()) throw new IllegalArgumentException("timeout must be positive"); this.timeout = value; return this; }
	public Client setMaxRetries(int value) { if (value < 0 || value > 10) throw new IllegalArgumentException("max retries must be between 0 and 10"); this.maxRetries = value; return this; }
	public Client setHooks(Consumer<RequestEvent> request, Consumer<ResponseEvent> response, Consumer<RetryEvent> retry) { this.onRequest = request; this.onResponse = response; this.onRetry = retry; return this; }

	private HttpRequest buildRequest(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body, RequestOptions options) {
		String url = baseUrl + path;
		if (query != null && !query.isEmpty()) {
			StringBuilder qs = new StringBuilder();
			for (Map.Entry<String, String> entry : query.entrySet()) {
				if (qs.length() > 0) qs.append("&");
				qs.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8));
				qs.append("=");
				qs.append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));
			}
			url += "?" + qs;
		}
		HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url)).method(method, body != null ? HttpRequest.BodyPublishers.ofString(body) : HttpRequest.BodyPublishers.noBody());
		for (Map.Entry<String, String> entry : headers.entrySet()) {
			builder.header(entry.getKey(), entry.getValue());
		}
		if (extraHeaders != null) {
			for (Map.Entry<String, String> entry : extraHeaders.entrySet()) {
				builder.header(entry.getKey(), entry.getValue());
			}
		}
		if (options != null && options.headers != null) {
			for (Map.Entry<String, String> entry : options.headers.entrySet()) builder.header(entry.getKey(), entry.getValue());
		}
		if (options != null && options.idempotencyKey != null && !options.idempotencyKey.isBlank()) builder.header("Idempotency-Key", options.idempotencyKey);
		Duration requestTimeout = options != null && options.timeout != null ? options.timeout : timeout;
		if (requestTimeout != null) builder.timeout(requestTimeout);
		if (body != null) {
			builder.header("Content-Type", "application/json");
		}
		return builder.build();
	}

	private static String buildErrorMessage(int statusCode, String responseBody) {
		String trimmed = responseBody == null ? "" : responseBody.trim();
		return trimmed.isEmpty()
			? "Request failed: " + statusCode
			: "Request failed: " + statusCode + ": " + trimmed;
	}

	public String request(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body) throws IOException, InterruptedException {
		return requestWithResponse(method, path, query, extraHeaders, body, null).data;
	}

	public RawResponse<String> requestWithResponse(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body, RequestOptions options) throws IOException, InterruptedException {
		String normalizedMethod = method.toUpperCase();
		int retries = options != null && options.maxRetries != null ? options.maxRetries : maxRetries;
		if (retries < 0 || retries > 10) throw new IllegalArgumentException("max retries must be between 0 and 10");
		if (!normalizedMethod.equals("GET") && !normalizedMethod.equals("HEAD")) retries = 0;
		long started = System.nanoTime();
		for (int attempt = 0; ; attempt++) {
			HttpRequest request = buildRequest(normalizedMethod, path, query, extraHeaders, body, options);
			RequestEvent event = new RequestEvent(normalizedMethod, request.uri().toString(), attempt, options == null ? null : options.idempotencyKey);
			if (onRequest != null) onRequest.accept(event);
			HttpResponse<String> response;
			try { response = http.send(request, HttpResponse.BodyHandlers.ofString()); }
			catch (IOException error) {
				if (attempt >= retries) throw error;
				long delay = backoffMillis(attempt);
				if (onRetry != null) onRetry.accept(new RetryEvent(event, null, delay, error));
				Thread.sleep(delay);
				continue;
			}
			if (retryableStatus(response.statusCode()) && attempt < retries) {
				long delay = retryAfterMillis(response.headers().map(), attempt);
				if (onRetry != null) onRetry.accept(new RetryEvent(event, response.statusCode(), delay, null));
				Thread.sleep(delay);
				continue;
			}
			RawResponse<String> raw = new RawResponse<>(response.statusCode(), response.headers().map(), response.body());
			if (onResponse != null) onResponse.accept(new ResponseEvent(event, response.statusCode(), raw.requestId(), (System.nanoTime() - started) / 1_000_000));
			if (response.statusCode() >= 400) throw new ApiException(response.statusCode(), response.body(), response.headers().map(), buildErrorMessage(response.statusCode(), response.body()));
			return raw;
		}
	}

	public Stream<String> requestLines(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body) throws IOException, InterruptedException {
		Map<String, String> streamHeaders = new HashMap<>();
		if (extraHeaders != null) streamHeaders.putAll(extraHeaders);
		streamHeaders.put("Accept", "text/event-stream");
		HttpResponse<Stream<String>> response = http.send(buildRequest(method, path, query, streamHeaders, body, null), HttpResponse.BodyHandlers.ofLines());
		if (response.statusCode() >= 400) {
			try (Stream<String> lines = response.body()) {
				String raw = String.join("\n", lines.toList());
				throw new ApiException(response.statusCode(), raw, response.headers().map(), buildErrorMessage(response.statusCode(), raw));
			}
		}
		return response.body();
	}

	public byte[] requestBytes(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body) throws IOException, InterruptedException {
		HttpRequest request = buildRequest(method, path, query, extraHeaders, body, null);
		HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
		if (response.statusCode() >= 400) {
			String raw = new String(response.body(), StandardCharsets.UTF_8);
			throw new ApiException(response.statusCode(), raw, response.headers().map(), buildErrorMessage(response.statusCode(), raw));
		}
		return response.body();
	}

	private static String firstHeader(Map<String, List<String>> headers, String... names) {
		if (headers == null) return null;
		for (String name : names) for (Map.Entry<String, List<String>> entry : headers.entrySet()) if (entry.getKey().equalsIgnoreCase(name) && !entry.getValue().isEmpty()) return entry.getValue().get(0);
		return null;
	}
	private static boolean retryableStatus(int status) { return status == 408 || status == 429 || status == 500 || status == 502 || status == 503 || status == 504; }
	private static long backoffMillis(int attempt) { return Math.min(250L * (1L << attempt), 5000L); }
	private static Long parseRetryAfter(String value) {
		if (value == null || value.isBlank()) return null;
		try { return Math.max(0L, (long) (Double.parseDouble(value) * 1000)); } catch (NumberFormatException ignored) { }
		try { return Math.max(0L, Duration.between(ZonedDateTime.now(), ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME)).toMillis()); } catch (DateTimeParseException ignored) { return null; }
	}
	private static long retryAfterMillis(Map<String, List<String>> headers, int attempt) { Long parsed = parseRetryAfter(firstHeader(headers, "retry-after")); return parsed == null ? backoffMillis(attempt) : parsed; }

}
