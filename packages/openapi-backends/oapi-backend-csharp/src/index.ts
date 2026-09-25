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

export const backendCsharp: Backend = {
	id: "csharp",
	async generate(ir: IR, _ctx: BackendContext): Promise<GeneratedFile[]> {
		const files: GeneratedFile[] = [];
		files.push({ path: "Client.cs", contents: renderClient() });
		files.push({ path: "Models.cs", contents: renderModels(ir.models) });
		files.push({ path: "Operations.cs", contents: renderOperations(ir.operations) });
		return files.sort((a, b) => a.path.localeCompare(b.path));
	}
};

export default backendCsharp;

function renderClient(): string {
	return [
		"using System;",
		"using System.Collections.Generic;",
		"using System.IO;",
		"using System.Net.Http;",
		"using System.Runtime.CompilerServices;",
		"using System.Text;",
		"using System.Text.Json;",
		"using System.Threading;",
		"using System.Threading.Tasks;",
		"",
		"namespace Phaseo.Gen;",
		"",
		"public sealed class RequestOptions",
		"{",
		"\tpublic TimeSpan? Timeout { get; init; }",
		"\tpublic int? MaxRetries { get; init; }",
		"\tpublic Dictionary<string, string>? Headers { get; init; }",
		"\tpublic string? IdempotencyKey { get; init; }",
		"\tpublic CancellationToken CancellationToken { get; init; }",
		"}",
		"",
		"public sealed record RequestEvent(string Method, string Url, int Attempt, string? IdempotencyKey, DateTimeOffset StartedAt);",
		"public sealed record ResponseEvent(RequestEvent Request, int StatusCode, string? RequestId, TimeSpan Elapsed);",
		"public sealed record RetryEvent(RequestEvent Request, int? StatusCode, TimeSpan Delay, Exception? Error);",
		"",
		"public sealed class RawResponse<T>",
		"{",
		"\tpublic int StatusCode { get; init; }",
		"\tpublic required Dictionary<string, string> Headers { get; init; }",
		"\tpublic T? Data { get; init; }",
		"\tpublic string? RequestId => Header(Headers, \"x-request-id\") ?? Header(Headers, \"x-phaseo-request-id\");",
		"\tpublic string? TraceUrl => RequestId is null ? null : \"https://phaseo.app/settings/usage/logs/requests/\" + Uri.EscapeDataString(RequestId);",
		"\tprivate static string? Header(Dictionary<string, string> headers, string name) { foreach (var pair in headers) if (string.Equals(pair.Key, name, StringComparison.OrdinalIgnoreCase)) return pair.Value; return null; }",
		"}",
		"",
		"public sealed class ApiErrorException : Exception",
		"{",
		"\tpublic int StatusCode { get; }",
		"\tpublic string ResponseBody { get; }",
		"\tpublic Dictionary<string, string> Headers { get; }",
		"\tpublic Dictionary<string, object?> Payload { get; }",
		"\tpublic string? RequestId => PayloadString(\"request_id\") ?? Header(\"x-request-id\") ?? Header(\"x-phaseo-request-id\");",
		"\tpublic string? GenerationId => PayloadString(\"generation_id\") ?? RequestId;",
		"\tpublic string? ErrorType => PayloadString(\"error_type\");",
		"\tpublic string? ErrorOrigin => PayloadString(\"error_origin\");",
		"\tpublic bool? Retryable => PayloadBool(\"retryable\");",
		"\tpublic string? Action => PayloadString(\"action\");",
		"\tpublic string? DocsUrl => PayloadString(\"docs_url\");",
		"\tpublic string? SupportUrl => PayloadString(\"support_url\");",
		"\tpublic long? RetryAfterSeconds => PayloadLong(\"retry_after_seconds\") ?? RetryAfterHeaderSeconds();",
		"\tpublic object? Details => Payload.TryGetValue(\"details\", out var value) ? value : null;",
		"\tpublic string? TraceUrl => RequestId is null ? null : \"https://phaseo.app/settings/usage/logs/requests/\" + Uri.EscapeDataString(RequestId);",
		"\tpublic string? Code { get; }",
		"\tpublic TimeSpan? RetryAfter { get; }",
		"",
		"\tpublic ApiErrorException(int statusCode, string responseBody, Dictionary<string, string>? headers, string message)",
		"\t\t: base(message)",
		"\t{",
		"\t\tStatusCode = statusCode;",
		"\t\tResponseBody = responseBody;",
		"\t\tHeaders = headers ?? new Dictionary<string, string>();",
		"\t\tPayload = ParsePayload(responseBody);",
		"\t\tCode = ParseCode(responseBody);",
		"\t\tRetryAfter = ParseRetryAfter(Header(\"retry-after\"));",
		"\t}",
		"\tprivate string? PayloadString(string name)",
		"\t{",
		"\t\tif (!Payload.TryGetValue(name, out var value) || value is null) return null;",
		"\t\tif (value is string text) return text;",
		"\t\tif (value is JsonElement element && element.ValueKind == JsonValueKind.String) return element.GetString();",
		"\t\treturn value.ToString();",
		"\t}",
		"\tprivate bool? PayloadBool(string name)",
		"\t{",
		"\t\tif (!Payload.TryGetValue(name, out var value) || value is null) return null;",
		"\t\tif (value is bool boolean) return boolean;",
		"\t\tif (value is JsonElement element && (element.ValueKind == JsonValueKind.True || element.ValueKind == JsonValueKind.False)) return element.GetBoolean();",
		"\t\treturn null;",
		"\t}",
		"\tprivate long? PayloadLong(string name)",
		"\t{",
		"\t\tif (!Payload.TryGetValue(name, out var value) || value is null) return null;",
		"\t\tif (value is long number) return number;",
		"\t\tif (value is int integer) return integer;",
		"\t\tif (value is JsonElement element && element.ValueKind == JsonValueKind.Number && element.TryGetInt64(out var parsed)) return parsed;",
		"\t\treturn long.TryParse(value.ToString(), out var fallback) ? fallback : null;",
		"\t}",
		"\tprivate long? RetryAfterHeaderSeconds()",
		"\t{",
		"\t\tvar retryAfter = RetryAfter;",
		"\t\treturn retryAfter is null ? null : (long)Math.Ceiling(Math.Max(0, retryAfter.Value.TotalSeconds));",
		"\t}",
		"\tprivate static Dictionary<string, object?> ParsePayload(string body)",
		"\t{",
		"\t\ttry { return JsonSerializer.Deserialize<Dictionary<string, object?>>(body) ?? new Dictionary<string, object?>(); }",
		"\t\tcatch (JsonException) { return new Dictionary<string, object?>(); }",
		"\t}",
		"\tprivate string? Header(string name) { foreach (var pair in Headers) if (string.Equals(pair.Key, name, StringComparison.OrdinalIgnoreCase)) return pair.Value; return null; }",
		"\tprivate static string? ParseCode(string body) { try { using var json = JsonDocument.Parse(body); var root = json.RootElement; if (root.TryGetProperty(\"code\", out var code) && code.ValueKind == JsonValueKind.String) return code.GetString(); if (root.TryGetProperty(\"error\", out var error)) { if (error.ValueKind == JsonValueKind.String) return error.GetString(); if (error.ValueKind == JsonValueKind.Object && error.TryGetProperty(\"code\", out code) && code.ValueKind == JsonValueKind.String) return code.GetString(); } } catch (JsonException) { } return null; }",
		"\tprivate static TimeSpan? ParseRetryAfter(string? value) { if (string.IsNullOrWhiteSpace(value)) return null; if (double.TryParse(value, out var seconds)) return TimeSpan.FromSeconds(Math.Max(0, seconds)); if (DateTimeOffset.TryParse(value, out var at)) return at <= DateTimeOffset.UtcNow ? TimeSpan.Zero : at - DateTimeOffset.UtcNow; return null; }",
		"}",
		"",
		"public sealed class Client",
		"{",
		"\tprivate readonly HttpClient _http;",
		"\tprivate readonly string _baseUrl;",
		"\tprivate readonly Dictionary<string, string> _headers;",
		"\tprivate TimeSpan _timeout = TimeSpan.FromSeconds(60);",
		"\tprivate int _maxRetries;",
		"\tprivate Action<RequestEvent>? _onRequest;",
		"\tprivate Action<ResponseEvent>? _onResponse;",
		"\tprivate Action<RetryEvent>? _onRetry;",
		"",
		"\tpublic Client(string baseUrl, HttpClient? httpClient = null, Dictionary<string, string>? headers = null)",
		"\t{",
		"\t\t_baseUrl = baseUrl.TrimEnd('/');",
		"\t\t_http = httpClient ?? new HttpClient();",
		"\t\t_headers = headers ?? new Dictionary<string, string>();",
		"\t}",
		"",
		"\tpublic Client SetTimeout(TimeSpan timeout) { if (timeout <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(timeout)); _timeout = timeout; return this; }",
		"\tpublic Client SetMaxRetries(int value) { if (value < 0 || value > 10) throw new ArgumentOutOfRangeException(nameof(value)); _maxRetries = value; return this; }",
		"\tpublic Client SetHooks(Action<RequestEvent>? request, Action<ResponseEvent>? response, Action<RetryEvent>? retry) { _onRequest = request; _onResponse = response; _onRetry = retry; return this; }",
		"",
		"\tprivate HttpRequestMessage BuildRequest(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null, RequestOptions? options = null)",
		"\t{",
		"\t\tvar url = _baseUrl + path;",
		"\t\tif (query != null && query.Count > 0)",
		"\t\t{",
		"\t\t\tvar parts = new List<string>();",
		"\t\t\tforeach (var kvp in query)",
		"\t\t\t{",
		"\t\t\t\tparts.Add(Uri.EscapeDataString(kvp.Key) + \"=\" + Uri.EscapeDataString(kvp.Value));",
		"\t\t\t}",
		"\t\t\turl += \"?\" + string.Join(\"&\", parts);",
		"\t\t}",
		"\t\tvar request = new HttpRequestMessage(new HttpMethod(method), url);",
		"\t\tforeach (var kvp in _headers)",
		"\t\t{",
		"\t\t\trequest.Headers.TryAddWithoutValidation(kvp.Key, kvp.Value);",
		"\t\t}",
		"\t\tif (headers != null)",
		"\t\t{",
		"\t\t\tforeach (var kvp in headers)",
		"\t\t\t{",
		"\t\t\t\trequest.Headers.TryAddWithoutValidation(kvp.Key, kvp.Value);",
		"\t\t\t}",
		"\t\t}",
		"\t\tif (options?.Headers != null)",
		"\t\t{",
		"\t\t\tforeach (var kvp in options.Headers) request.Headers.TryAddWithoutValidation(kvp.Key, kvp.Value);",
		"\t\t}",
		"\t\tif (!string.IsNullOrWhiteSpace(options?.IdempotencyKey)) request.Headers.TryAddWithoutValidation(\"Idempotency-Key\", options.IdempotencyKey);",
		"\t\tif (body != null)",
		"\t\t{",
		"\t\t\tvar json = JsonSerializer.Serialize(body);",
		"\t\t\trequest.Content = new StringContent(json, Encoding.UTF8, \"application/json\");",
		"\t\t}",
		"\t\treturn request;",
		"\t}",
		"",
		"\tprivate static string BuildErrorMessage(int statusCode, string responseBody)",
		"\t{",
		"\t\tvar trimmed = responseBody?.Trim();",
		"\t\treturn string.IsNullOrWhiteSpace(trimmed)",
		"\t\t\t? $\"Request failed with status code {statusCode}.\"",
		"\t\t\t: $\"Request failed with status code {statusCode}: {trimmed}\";",
		"\t}",
		"",
		"\tpublic async Task<T?> SendAsync<T>(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null)",
		"\t{",
		"\t\treturn (await SendWithResponseAsync<T>(method, path, query, headers, body).ConfigureAwait(false)).Data;",
		"\t}",
		"",
		"\tpublic async Task<RawResponse<T>> SendWithResponseAsync<T>(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null, RequestOptions? options = null)",
		"\t{",
		"\t\tvar rawResult = await SendRawWithResponseAsync(method, path, query, headers, body, options).ConfigureAwait(false);",
		"\t\tvar raw = rawResult.Data.Length == 0 ? string.Empty : Encoding.UTF8.GetString(rawResult.Data);",
		"\t\tT? data = string.IsNullOrWhiteSpace(raw) ? default : JsonSerializer.Deserialize<T>(raw);",
		"\t\treturn new RawResponse<T> { StatusCode = rawResult.StatusCode, Headers = rawResult.Headers, Data = data };",
		"\t}",
		"",
		"\tprivate async Task<RawResponse<byte[]>> SendRawWithResponseAsync(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null, RequestOptions? options = null)",
		"\t{",
		"\t\tvar normalizedMethod = method.ToUpperInvariant();",
		"\t\tvar retries = options?.MaxRetries ?? _maxRetries;",
		"\t\tif (retries < 0 || retries > 10) throw new ArgumentOutOfRangeException(nameof(options.MaxRetries));",
		"\t\tif (normalizedMethod != \"GET\" && normalizedMethod != \"HEAD\") retries = 0;",
		"\t\tusing var timeout = CancellationTokenSource.CreateLinkedTokenSource(options?.CancellationToken ?? default);",
		"\t\ttimeout.CancelAfter(options?.Timeout ?? _timeout);",
		"\t\tvar started = DateTimeOffset.UtcNow;",
		"\t\tfor (var attempt = 0; ; attempt++)",
		"\t\t{",
		"\t\t\tusing var request = BuildRequest(normalizedMethod, path, query, headers, body, options);",
		"\t\t\tvar requestEvent = new RequestEvent(normalizedMethod, request.RequestUri!.ToString(), attempt, options?.IdempotencyKey, DateTimeOffset.UtcNow);",
		"\t\t\t_onRequest?.Invoke(requestEvent);",
		"\t\t\tHttpResponseMessage response;",
		"\t\t\ttry { response = await _http.SendAsync(request, timeout.Token).ConfigureAwait(false); }",
		"\t\t\tcatch (HttpRequestException error) when (attempt < retries)",
		"\t\t\t{",
		"\t\t\t\tvar delay = Backoff(attempt); _onRetry?.Invoke(new RetryEvent(requestEvent, null, delay, error)); await Task.Delay(delay, timeout.Token).ConfigureAwait(false); continue;",
		"\t\t\t}",
		"\t\t\tusing (response)",
		"\t\t\t{",
		"\t\t\t\tvar bytes = await response.Content.ReadAsByteArrayAsync(timeout.Token).ConfigureAwait(false);",
		"\t\t\t\tvar raw = bytes.Length == 0 ? string.Empty : Encoding.UTF8.GetString(bytes);",
		"\t\t\t\tvar responseHeaders = Headers(response);",
		"\t\t\t\tif (Retryable((int)response.StatusCode) && attempt < retries)",
		"\t\t\t\t{",
		"\t\t\t\t\tvar delay = RetryDelay(responseHeaders, attempt); _onRetry?.Invoke(new RetryEvent(requestEvent, (int)response.StatusCode, delay, null)); await Task.Delay(delay, timeout.Token).ConfigureAwait(false); continue;",
		"\t\t\t\t}",
		"\t\t\t\tvar result = new RawResponse<byte[]> { StatusCode = (int)response.StatusCode, Headers = responseHeaders, Data = bytes };",
		"\t\t\t\t_onResponse?.Invoke(new ResponseEvent(requestEvent, result.StatusCode, result.RequestId, DateTimeOffset.UtcNow - started));",
		"\t\t\t\tif (!response.IsSuccessStatusCode) throw new ApiErrorException(result.StatusCode, raw, responseHeaders, BuildErrorMessage(result.StatusCode, raw));",
		"\t\t\t\treturn result;",
		"\t\t\t}",
		"\t\t}",
		"\t}",
		"",
		"\tpublic async Task<string> SendTextAsync(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null)",
		"\t{",
		"\t\tvar result = await SendRawWithResponseAsync(method, path, query, headers, body).ConfigureAwait(false);",
		"\t\treturn result.Data.Length == 0 ? string.Empty : Encoding.UTF8.GetString(result.Data);",
		"\t}",
		"",
		"\tpublic async Task<byte[]> SendBytesAsync(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null)",
		"\t{",
		"\t\treturn (await SendRawWithResponseAsync(method, path, query, headers, body).ConfigureAwait(false)).Data;",
		"\t}",
		"",
		"\tpublic async IAsyncEnumerable<string> StreamLinesAsync(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null, [EnumeratorCancellation] CancellationToken cancellationToken = default)",
		"\t{",
		"\t\tvar normalizedMethod = method.ToUpperInvariant();",
		"\t\tvar retries = normalizedMethod == \"GET\" || normalizedMethod == \"HEAD\" ? _maxRetries : 0;",
		"\t\tusing var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);",
		"\t\ttimeout.CancelAfter(_timeout);",
		"\t\tvar started = DateTimeOffset.UtcNow;",
		"\t\tfor (var attempt = 0; ; attempt++)",
		"\t\t{",
		"\t\t\tusing var request = BuildRequest(normalizedMethod, path, query, headers, body);",
		"\t\t\trequest.Headers.TryAddWithoutValidation(\"Accept\", \"text/event-stream\");",
		"\t\t\tvar requestEvent = new RequestEvent(normalizedMethod, request.RequestUri!.ToString(), attempt, null, DateTimeOffset.UtcNow);",
		"\t\t\t_onRequest?.Invoke(requestEvent);",
		"\t\t\tHttpResponseMessage response;",
		"\t\t\ttry { response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token).ConfigureAwait(false); }",
		"\t\t\tcatch (HttpRequestException error) when (attempt < retries)",
		"\t\t\t{",
		"\t\t\t\tvar delay = Backoff(attempt); _onRetry?.Invoke(new RetryEvent(requestEvent, null, delay, error)); await Task.Delay(delay, timeout.Token).ConfigureAwait(false); continue;",
		"\t\t\t}",
		"\t\t\tvar responseHeaders = Headers(response);",
		"\t\t\tif (Retryable((int)response.StatusCode) && attempt < retries)",
		"\t\t\t{",
		"\t\t\t\tvar delay = RetryDelay(responseHeaders, attempt); response.Dispose(); _onRetry?.Invoke(new RetryEvent(requestEvent, (int)response.StatusCode, delay, null)); await Task.Delay(delay, timeout.Token).ConfigureAwait(false); continue;",
		"\t\t\t}",
		"\t\t\t_onResponse?.Invoke(new ResponseEvent(requestEvent, (int)response.StatusCode, responseHeaders.TryGetValue(\"x-request-id\", out var requestId) ? requestId : null, DateTimeOffset.UtcNow - started));",
		"\t\t\tif (!response.IsSuccessStatusCode)",
		"\t\t\t{",
		"\t\t\t\tusing (response)",
		"\t\t\t\t{",
		"\t\t\t\t\tvar raw = await response.Content.ReadAsStringAsync(timeout.Token).ConfigureAwait(false);",
		"\t\t\t\t\tthrow new ApiErrorException((int)response.StatusCode, raw, responseHeaders, BuildErrorMessage((int)response.StatusCode, raw));",
		"\t\t\t\t}",
		"\t\t\t}",
		"\t\t\tusing (response)",
		"\t\t\t{",
		"\t\t\t\tawait using var stream = await response.Content.ReadAsStreamAsync(timeout.Token).ConfigureAwait(false);",
		"\t\t\t\tusing var reader = new StreamReader(stream);",
		"\t\t\t\twhile (!reader.EndOfStream)",
		"\t\t\t\t{",
		"\t\t\t\t\tvar line = await reader.ReadLineAsync(timeout.Token).ConfigureAwait(false);",
		"\t\t\t\t\tif (line is not null) yield return line;",
		"\t\t\t\t}",
		"\t\t\t}",
		"\t\t\tyield break;",
		"\t\t}",
		"\t}",
		"",
		"\tprivate static Dictionary<string, string> Headers(HttpResponseMessage response)",
		"\t{",
		"\t\tvar values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);",
		"\t\tforeach (var pair in response.Headers) values[pair.Key] = string.Join(\",\", pair.Value);",
		"\t\tforeach (var pair in response.Content.Headers) values[pair.Key] = string.Join(\",\", pair.Value);",
		"\t\treturn values;",
		"\t}",
		"\tprivate static bool Retryable(int status) => status is 408 or 429 or 500 or 502 or 503 or 504;",
		"\tprivate static TimeSpan Backoff(int attempt) => TimeSpan.FromMilliseconds(Math.Min(250 * Math.Pow(2, attempt), 5000));",
		"\tprivate static TimeSpan RetryDelay(Dictionary<string, string> headers, int attempt)",
		"\t{",
		"\t\tif (headers.TryGetValue(\"Retry-After\", out var value)) { if (double.TryParse(value, out var seconds)) return TimeSpan.FromSeconds(Math.Max(0, seconds)); if (DateTimeOffset.TryParse(value, out var at)) return at <= DateTimeOffset.UtcNow ? TimeSpan.Zero : at - DateTimeOffset.UtcNow; }",
		"\t\treturn Backoff(attempt);",
		"\t}",
		"}",
		""
	].join("\n");
}

function renderModels(models: IRModel[]): string {
	const lines: string[] = [
		"using System;",
		"using System.Collections.Generic;",
		"using System.Text.Json.Serialization;",
		"",
		"namespace Phaseo.Gen;",
		""
	];
	for (const model of models) {
		lines.push(renderModel(model));
		lines.push("");
	}
	return lines.join("\n");
}

function renderModel(model: IRModel): string {
	if (model.schema.kind === "object") {
		const required = new Set(model.schema.required);
		const fields = Object.keys(model.schema.properties).sort((a, b) => a.localeCompare(b));
		const lines: string[] = [`public sealed class ${model.name}`, "{"]; 
		for (const field of fields) {
			const name = exportPropertyName(model.name, field);
			const type = renderFieldType(model.schema.properties[field], required.has(field));
			lines.push(`\t[JsonPropertyName(${JSON.stringify(field)})]`);
			lines.push(`\tpublic ${type} ${name} { get; set; }`);
			lines.push("");
		}
		lines.push("}");
		return lines.join("\n");
	}
	return `public sealed class ${model.name} { }`;
}

function renderOperations(operations: IROperation[]): string {
	const lines: string[] = [
		"using System;",
		"using System.Collections.Generic;",
		"using System.Threading.Tasks;",
		"",
		"namespace Phaseo.Gen;",
		"",
		"public static class Operations",
		"{"
	];
	for (const operation of operations) {
		lines.push(renderOperation(operation));
	}
	lines.push("}");
	lines.push("");
	return lines.join("\n");
}

function renderOperation(operation: IROperation): string {
	const successResponse = selectSuccessResponse(operation);
	const returnType = csType(successResponse.schema ?? { kind: "unknown" });
	const pathParams = operation.params.filter((param) => param.in === "path");
	const pathTemplate = renderPathTemplate(operation.path, pathParams);
	return [
		`\tpublic static Task<${returnType}?> ${exportName(operation.operationId)}Async(`,
		"\t\tClient client,",
		"\t\tDictionary<string, string>? path = null,",
		"\t\tDictionary<string, string>? query = null,",
		"\t\tDictionary<string, string>? headers = null,",
		"\t\tobject? body = null",
		"\t)",
		"\t{",
		`\t\tvar resolvedPath = ${pathTemplate};`,
		(successResponse.kind === "text"
			? `\t\treturn client.SendTextAsync(\"${operation.method.toUpperCase()}\", resolvedPath, query, headers, body);`
			: `\t\treturn client.SendAsync<${returnType}>(\"${operation.method.toUpperCase()}\", resolvedPath, query, headers, body);`),
		"\t}",
		""
	].join("\n");
}

function selectSuccessResponse(operation: IROperation): IROperation["responses"][number] {
	return operation.responses.find((response) => {
		const status = Number(response.status);
		return !Number.isNaN(status) && status >= 200 && status < 300;
	}) ?? { status: "default", schema: { kind: "unknown" } };
}

function renderPathTemplate(path: string, params: IROperation["params"]): string {
	if (params.length === 0) {
		return JSON.stringify(path);
	}
	const segments = splitPathTemplate(path);
	const parts = segments.map((segment) => {
		if (segment.startsWith("{") && segment.endsWith("}")) {
			const name = JSON.stringify(segment.slice(1, -1));
			return `Uri.EscapeDataString(path != null && path.ContainsKey(${name}) ? path[${name}] : "")`;
		}
		return JSON.stringify(segment);
	});
	return parts.join(" + ");
}

function selectSuccessSchema(operation: IROperation): IRSchema {
	for (const response of operation.responses) {
		const status = Number(response.status);
		if (!Number.isNaN(status) && status >= 200 && status < 300) {
			return response.schema ?? { kind: "unknown" };
		}
	}
	return { kind: "unknown" };
}

function renderFieldType(schema: IRSchema, required: boolean): string {
	const base = csType(schema);
	if (required) {
		return base;
	}
	if (base.endsWith("?")) {
		return base;
	}
	if (base == "string" || base == "object") {
		return `${base}?`;
	}
	return `${base}?`;
}

function csType(schema: IRSchema): string {
	switch (schema.kind) {
		case "primitive":
			if (schema.type === "boolean") return "bool";
			if (schema.type === "integer") return "long";
			if (schema.type === "number") return "double";
			return "string";
		case "literal":
			return "object";
		case "enum":
			return schema.values.filter((value) => value !== null).every((value) => typeof value === "boolean") ? "bool" : "string";
		case "array":
			return `List<${csType(schema.items)}>`;
		case "object":
			if (isModelLifecycleObject(schema)) return "ModelLifecycle";
			return "Dictionary<string, object>";
		case "union":
		case "intersection":
			return "object";
		case "ref":
			return schema.name;
		case "nullable":
			return csType(schema.inner) + "?";
		case "unknown":
		default:
			return "object";
	}
}

function isModelLifecycleObject(schema: IRSchema): boolean {
	if (schema.kind !== "object" || schema.additionalProperties) return false;
	const keys = Object.keys(schema.properties).sort((a, b) => a.localeCompare(b));
	const expected = ["deprecation_date", "message", "replacement_model_id", "retirement_date", "status"];
	if (keys.length !== expected.length) return false;
	return expected.every((value, index) => keys[index] === value);
}

function exportName(value: string): string {
	const cleaned = value.replace(/[^a-zA-Z0-9]+/g, " ");
	const parts = cleaned.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "Value";
	return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function exportPropertyName(modelName: string, value: string): string {
	const name = exportName(value);
	if (name === modelName) {
		return `${name}Value`;
	}
	return name;
}
