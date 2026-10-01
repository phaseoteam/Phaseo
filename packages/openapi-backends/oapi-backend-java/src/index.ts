import type {
	Backend,
	BackendContext,
	GeneratedFile,
	IR,
	IRModel,
	IROperation,
	IRSchema
} from "@phaseo/oapi-core";
import { splitPathTemplate } from "@phaseo/oapi-core";

export const backendJava: Backend = {
	id: "java",
	async generate(ir: IR, _ctx: BackendContext): Promise<GeneratedFile[]> {
		const files: GeneratedFile[] = [];
		files.push({ path: "Client.java", contents: renderClient() });
		files.push({ path: "Models.java", contents: renderModels(ir.models) });
		files.push({ path: "Operations.java", contents: renderOperations(ir.operations) });
		return files.sort((a, b) => a.path.localeCompare(b.path));
	}
};

export default backendJava;

function renderClient(): string {
	return [
		"package app.phaseo.gen;",
		"",
		"import java.io.IOException;",
		"import java.net.URI;",
		"import java.net.URLEncoder;",
		"import java.net.http.HttpClient;",
		"import java.net.http.HttpRequest;",
		"import java.net.http.HttpResponse;",
		"import java.nio.charset.StandardCharsets;",
		"import java.time.Duration;",
		"import java.time.ZonedDateTime;",
		"import java.time.format.DateTimeFormatter;",
		"import java.time.format.DateTimeParseException;",
		"import java.util.Collections;",
		"import java.util.HashMap;",
		"import java.util.List;",
		"import java.util.Map;",
		"import java.util.function.Consumer;",
		"import java.util.stream.Stream;",
		"",
		"public class Client {",
		"\tpublic static final class RequestOptions {",
		"\t\tpublic Duration timeout;",
		"\t\tpublic Integer maxRetries;",
		"\t\tpublic Map<String, String> headers;",
		"\t\tpublic String idempotencyKey;",
		"\t}",
		"",
		"\tpublic static final class RequestEvent {",
		"\t\tpublic final String method; public final String url; public final int attempt; public final String idempotencyKey; public final long startedAtMillis;",
		"\t\tRequestEvent(String method, String url, int attempt, String idempotencyKey) { this.method = method; this.url = url; this.attempt = attempt; this.idempotencyKey = idempotencyKey; this.startedAtMillis = System.currentTimeMillis(); }",
		"\t}",
		"",
		"\tpublic static final class ResponseEvent {",
		"\t\tpublic final RequestEvent request; public final int statusCode; public final String requestId; public final long elapsedMillis;",
		"\t\tResponseEvent(RequestEvent request, int statusCode, String requestId, long elapsedMillis) { this.request = request; this.statusCode = statusCode; this.requestId = requestId; this.elapsedMillis = elapsedMillis; }",
		"\t}",
		"",
		"\tpublic static final class RetryEvent {",
		"\t\tpublic final RequestEvent request; public final Integer statusCode; public final long delayMillis; public final Exception error;",
		"\t\tRetryEvent(RequestEvent request, Integer statusCode, long delayMillis, Exception error) { this.request = request; this.statusCode = statusCode; this.delayMillis = delayMillis; this.error = error; }",
		"\t}",
		"",
		"\tpublic static final class RawResponse<T> {",
		"\t\tpublic final int statusCode; public final Map<String, List<String>> headers; public final T data;",
		"\t\tRawResponse(int statusCode, Map<String, List<String>> headers, T data) { this.statusCode = statusCode; this.headers = headers; this.data = data; }",
		"\t\tpublic String requestId() { return firstHeader(headers, \"x-request-id\", \"x-phaseo-request-id\"); }",
		"\t\tpublic String traceUrl() { String id = requestId(); return id == null ? null : \"https://phaseo.app/settings/usage/logs/requests/\" + URLEncoder.encode(id, StandardCharsets.UTF_8).replace(\"+\", \"%20\"); }",
		"\t}",
		"",
		"\tprivate final String baseUrl;",
		"\tprivate final HttpClient http;",
		"\tprivate final Map<String, String> headers;",
		"\tprivate Duration timeout = Duration.ofSeconds(60);",
		"\tprivate int maxRetries = 0;",
		"\tprivate Consumer<RequestEvent> onRequest;",
		"\tprivate Consumer<ResponseEvent> onResponse;",
		"\tprivate Consumer<RetryEvent> onRetry;",
		"",
		"\tpublic static final class ApiException extends IOException {",
		"\t\tprivate final int statusCode;",
		"\t\tprivate final String responseBody;",
		"\t\tprivate final Map<String, List<String>> headers;",
		"",
		"\t\tpublic ApiException(int statusCode, String responseBody, Map<String, List<String>> headers, String message) {",
		"\t\t\tsuper(message);",
		"\t\t\tthis.statusCode = statusCode;",
		"\t\t\tthis.responseBody = responseBody;",
		"\t\t\tthis.headers = headers == null ? Collections.emptyMap() : headers;",
		"\t\t}",
		"",
		"\t\tpublic int getStatusCode() {",
		"\t\t\treturn statusCode;",
		"\t\t}",
		"",
		"\t\tpublic String getResponseBody() {",
		"\t\t\treturn responseBody;",
		"\t\t}",
		"",
		"\t\tpublic Map<String, List<String>> getHeaders() { return headers; }",
		"\t\tpublic String getRequestId() { return firstHeader(headers, \"x-request-id\", \"x-phaseo-request-id\"); }",
		"\t\tpublic String getTraceUrl() { String id = getRequestId(); return id == null ? null : \"https://phaseo.app/settings/usage/logs/requests/\" + URLEncoder.encode(id, StandardCharsets.UTF_8).replace(\"+\", \"%20\"); }",
		"\t\tpublic String getCode() { java.util.regex.Matcher matcher = java.util.regex.Pattern.compile(\"\\\"code\\\"\\\\s*:\\s*\\\"([^\\\"]+)\\\"\").matcher(responseBody == null ? \"\" : responseBody); return matcher.find() ? matcher.group(1) : null; }",
		"\t\tpublic Long getRetryAfterMillis() { return parseRetryAfter(firstHeader(headers, \"retry-after\")); }",
		"\t}",
		"",
		"\tpublic Client(String baseUrl) {",
		"\t\tthis(baseUrl, HttpClient.newHttpClient(), new HashMap<>());",
		"\t}",
		"",
		"\tpublic Client(String baseUrl, HttpClient http, Map<String, String> headers) {",
		"\t\tthis.baseUrl = baseUrl.replaceAll(\"/+$\", \"\");",
		"\t\tthis.http = http;",
		"\t\tthis.headers = headers;",
		"\t}",
		"",
		"\tpublic Client setTimeout(Duration value) { if (value == null || value.isNegative() || value.isZero()) throw new IllegalArgumentException(\"timeout must be positive\"); this.timeout = value; return this; }",
		"\tpublic Client setMaxRetries(int value) { if (value < 0 || value > 10) throw new IllegalArgumentException(\"max retries must be between 0 and 10\"); this.maxRetries = value; return this; }",
		"\tpublic Client setHooks(Consumer<RequestEvent> request, Consumer<ResponseEvent> response, Consumer<RetryEvent> retry) { this.onRequest = request; this.onResponse = response; this.onRetry = retry; return this; }",
		"",
		"\tprivate HttpRequest buildRequest(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body, RequestOptions options) {",
		"\t\tString url = baseUrl + path;",
		"\t\tif (query != null && !query.isEmpty()) {",
		"\t\t\tStringBuilder qs = new StringBuilder();",
		"\t\t\tfor (Map.Entry<String, String> entry : query.entrySet()) {",
		"\t\t\t\tif (qs.length() > 0) qs.append(\"&\");",
		"\t\t\t\tqs.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8));",
		"\t\t\t\tqs.append(\"=\");",
		"\t\t\t\tqs.append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));",
		"\t\t\t}",
		"\t\t\turl += \"?\" + qs;",
		"\t\t}",
		"\t\tHttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url)).method(method, body != null ? HttpRequest.BodyPublishers.ofString(body) : HttpRequest.BodyPublishers.noBody());",
		"\t\tfor (Map.Entry<String, String> entry : headers.entrySet()) {",
		"\t\t\tbuilder.header(entry.getKey(), entry.getValue());",
		"\t\t}",
		"\t\tif (extraHeaders != null) {",
		"\t\t\tfor (Map.Entry<String, String> entry : extraHeaders.entrySet()) {",
		"\t\t\t\tbuilder.header(entry.getKey(), entry.getValue());",
		"\t\t\t}",
		"\t\t}",
		"\t\tif (options != null && options.headers != null) {",
		"\t\t\tfor (Map.Entry<String, String> entry : options.headers.entrySet()) builder.header(entry.getKey(), entry.getValue());",
		"\t\t}",
		"\t\tif (options != null && options.idempotencyKey != null && !options.idempotencyKey.isBlank()) builder.header(\"Idempotency-Key\", options.idempotencyKey);",
		"\t\tDuration requestTimeout = options != null && options.timeout != null ? options.timeout : timeout;",
		"\t\tif (requestTimeout != null) builder.timeout(requestTimeout);",
		"\t\tif (body != null) {",
		"\t\t\tbuilder.header(\"Content-Type\", \"application/json\");",
		"\t\t}",
		"\t\treturn builder.build();",
		"\t}",
		"",
		"\tprivate static String buildErrorMessage(int statusCode, String responseBody) {",
		"\t\tString trimmed = responseBody == null ? \"\" : responseBody.trim();",
		"\t\treturn trimmed.isEmpty()",
		'\t\t\t? \"Request failed: \" + statusCode',
		'\t\t\t: \"Request failed: \" + statusCode + \": \" + trimmed;',
		"\t}",
		"",
		"\tpublic String request(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body) throws IOException, InterruptedException {",
		"\t\treturn requestWithResponse(method, path, query, extraHeaders, body, null).data;",
		"\t}",
		"",
		"\tpublic RawResponse<String> requestWithResponse(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body, RequestOptions options) throws IOException, InterruptedException {",
		"\t\tString normalizedMethod = method.toUpperCase();",
		"\t\tint retries = options != null && options.maxRetries != null ? options.maxRetries : maxRetries;",
		"\t\tif (retries < 0 || retries > 10) throw new IllegalArgumentException(\"max retries must be between 0 and 10\");",
		"\t\tif (!normalizedMethod.equals(\"GET\") && !normalizedMethod.equals(\"HEAD\")) retries = 0;",
		"\t\tlong started = System.nanoTime();",
		"\t\tfor (int attempt = 0; ; attempt++) {",
		"\t\t\tHttpRequest request = buildRequest(normalizedMethod, path, query, extraHeaders, body, options);",
		"\t\t\tRequestEvent event = new RequestEvent(normalizedMethod, request.uri().toString(), attempt, options == null ? null : options.idempotencyKey);",
		"\t\t\tif (onRequest != null) onRequest.accept(event);",
		"\t\t\tHttpResponse<String> response;",
		"\t\t\ttry { response = http.send(request, HttpResponse.BodyHandlers.ofString()); }",
		"\t\t\tcatch (IOException error) {",
		"\t\t\t\tif (attempt >= retries) throw error;",
		"\t\t\t\tlong delay = backoffMillis(attempt);",
		"\t\t\t\tif (onRetry != null) onRetry.accept(new RetryEvent(event, null, delay, error));",
		"\t\t\t\tThread.sleep(delay);",
		"\t\t\t\tcontinue;",
		"\t\t\t}",
		"\t\t\tif (retryableStatus(response.statusCode()) && attempt < retries) {",
		"\t\t\t\tlong delay = retryAfterMillis(response.headers().map(), attempt);",
		"\t\t\t\tif (onRetry != null) onRetry.accept(new RetryEvent(event, response.statusCode(), delay, null));",
		"\t\t\t\tThread.sleep(delay);",
		"\t\t\t\tcontinue;",
		"\t\t\t}",
		"\t\t\tRawResponse<String> raw = new RawResponse<>(response.statusCode(), response.headers().map(), response.body());",
		"\t\t\tif (onResponse != null) onResponse.accept(new ResponseEvent(event, response.statusCode(), raw.requestId(), (System.nanoTime() - started) / 1_000_000));",
		"\t\t\tif (response.statusCode() >= 400) throw new ApiException(response.statusCode(), response.body(), response.headers().map(), buildErrorMessage(response.statusCode(), response.body()));",
		"\t\t\treturn raw;",
		"\t\t}",
		"\t}",
		"",
		"\tpublic Stream<String> requestLines(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body) throws IOException, InterruptedException {",
		"\t\tMap<String, String> streamHeaders = new HashMap<>();",
		"\t\tif (extraHeaders != null) streamHeaders.putAll(extraHeaders);",
		"\t\tstreamHeaders.put(\"Accept\", \"text/event-stream\");",
		"\t\tHttpResponse<Stream<String>> response = http.send(buildRequest(method, path, query, streamHeaders, body, null), HttpResponse.BodyHandlers.ofLines());",
		"\t\tif (response.statusCode() >= 400) {",
		"\t\t\ttry (Stream<String> lines = response.body()) {",
		"\t\t\t\tString raw = String.join(\"\\n\", lines.toList());",
		"\t\t\t\tthrow new ApiException(response.statusCode(), raw, response.headers().map(), buildErrorMessage(response.statusCode(), raw));",
		"\t\t\t}",
		"\t\t}",
		"\t\treturn response.body();",
		"\t}",
		"",
		"\tpublic byte[] requestBytes(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body) throws IOException, InterruptedException {",
		"\t\tHttpRequest request = buildRequest(method, path, query, extraHeaders, body, null);",
		"\t\tHttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());",
		"\t\tif (response.statusCode() >= 400) {",
		"\t\t\tString raw = new String(response.body(), StandardCharsets.UTF_8);",
		"\t\t\tthrow new ApiException(response.statusCode(), raw, response.headers().map(), buildErrorMessage(response.statusCode(), raw));",
		"\t\t}",
		"\t\treturn response.body();",
		"\t}",
		"",
		"\tprivate static String firstHeader(Map<String, List<String>> headers, String... names) {",
		"\t\tif (headers == null) return null;",
		"\t\tfor (String name : names) for (Map.Entry<String, List<String>> entry : headers.entrySet()) if (entry.getKey().equalsIgnoreCase(name) && !entry.getValue().isEmpty()) return entry.getValue().get(0);",
		"\t\treturn null;",
		"\t}",
		"\tprivate static boolean retryableStatus(int status) { return status == 408 || status == 429 || status == 500 || status == 502 || status == 503 || status == 504; }",
		"\tprivate static long backoffMillis(int attempt) { return Math.min(250L * (1L << attempt), 5000L); }",
		"\tprivate static Long parseRetryAfter(String value) {",
		"\t\tif (value == null || value.isBlank()) return null;",
		"\t\ttry { return Math.max(0L, (long) (Double.parseDouble(value) * 1000)); } catch (NumberFormatException ignored) { }",
		"\t\ttry { return Math.max(0L, Duration.between(ZonedDateTime.now(), ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME)).toMillis()); } catch (DateTimeParseException ignored) { return null; }",
		"\t}",
		"\tprivate static long retryAfterMillis(Map<String, List<String>> headers, int attempt) { Long parsed = parseRetryAfter(firstHeader(headers, \"retry-after\")); return parsed == null ? backoffMillis(attempt) : parsed; }",
		"",
		"}",
		""
	].join("\n");
}

function renderModels(models: IRModel[]): string {
	const lines: string[] = ["package app.phaseo.gen;", "", "public final class Models {", "\tprivate Models() {}", ""];
	for (const model of models) {
		lines.push(renderModel(model));
		lines.push("");
	}
	lines.push("}");
	lines.push("");
	return lines.join("\n");
}

function renderModel(model: IRModel): string {
	const lines: string[] = [`\tpublic static class ${model.name} {`];
	if (model.schema.kind === "object") {
		const fields = Object.keys(model.schema.properties).sort((a, b) => a.localeCompare(b));
		for (const field of fields) {
			const name = sanitizeIdentifier(field);
			lines.push(`\t\tpublic ${javaType(model.schema.properties[field])} ${name};`);
		}
	}
	lines.push("\t}");
	return lines.join("\n");
}

function renderOperations(operations: IROperation[]): string {
	const lines: string[] = [
		"package app.phaseo.gen;",
		"",
		"import java.io.IOException;",
		"import java.util.Map;",
		"",
		"public final class Operations {",
		"\tprivate Operations() {}",
		""
	];
	for (const operation of operations) {
		lines.push(renderOperation(operation));
		lines.push("");
	}
	lines.push("}");
	lines.push("");
	return lines.join("\n");
}

function renderOperation(operation: IROperation): string {
	const pathParams = operation.params.filter((param) => param.in === "path");
	const pathTemplate = renderPathTemplate(operation.path, pathParams);
	return [
		`\tpublic static Object ${operation.operationId}(Client client, Map<String, String> path, Map<String, String> query, Map<String, String> headers, String body) throws IOException, InterruptedException {`,
		`\t\tString resolvedPath = ${pathTemplate};`,
		`\t\treturn client.request("${operation.method.toUpperCase()}", resolvedPath, query, headers, body);`,
		"\t}"
	].join("\n");
}

function renderPathTemplate(path: string, params: IROperation["params"]): string {
	if (params.length === 0) {
		return JSON.stringify(path);
	}
	const segments = splitPathTemplate(path);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = JSON.stringify(segment.slice(1, -1));
			return `(path != null && path.containsKey(${name}) ? path.get(${name}) : "")`;
		}
		return JSON.stringify(segment);
	});
	return parts.join(" + ");
}

function javaType(schema: IRSchema): string {
	switch (schema.kind) {
		case "primitive":
			if (schema.type === "boolean") return "Boolean";
			if (schema.type === "integer") return "Integer";
			if (schema.type === "number") return "Double";
			return "String";
		case "array":
			return `java.util.List<${javaType(schema.items)}>`;
		case "object":
			if (isModelLifecycleObject(schema)) return "Models.ModelLifecycle";
		case "union":
		case "intersection":
			return "Object";
		case "ref":
			return `Models.${schema.name}`;
		case "nullable":
			return javaType(schema.inner);
		case "enum":
		case "literal":
		case "unknown":
		default:
			return "Object";
	}
}

function isModelLifecycleObject(schema: IRSchema): boolean {
	if (schema.kind !== "object" || schema.additionalProperties) return false;
	const keys = Object.keys(schema.properties).sort((a, b) => a.localeCompare(b));
	const expected = ["deprecation_date", "message", "replacement_model_id", "retirement_date", "status"];
	if (keys.length !== expected.length) return false;
	return expected.every((value, index) => keys[index] === value);
}

function sanitizeIdentifier(name: string): string {
	if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
		return name;
	}
	return name.replace(/[^a-zA-Z0-9_]/g, "_");
}
