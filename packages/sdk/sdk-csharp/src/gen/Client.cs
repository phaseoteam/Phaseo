using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Phaseo.Gen;

public sealed class RequestOptions
{
	public TimeSpan? Timeout { get; init; }
	public int? MaxRetries { get; init; }
	public Dictionary<string, string>? Headers { get; init; }
	public string? IdempotencyKey { get; init; }
	public CancellationToken CancellationToken { get; init; }
}

public sealed record RequestEvent(string Method, string Url, int Attempt, string? IdempotencyKey, DateTimeOffset StartedAt);
public sealed record ResponseEvent(RequestEvent Request, int StatusCode, string? RequestId, TimeSpan Elapsed);
public sealed record RetryEvent(RequestEvent Request, int? StatusCode, TimeSpan Delay, Exception? Error);

public sealed class RawResponse<T>
{
	public int StatusCode { get; init; }
	public required Dictionary<string, string> Headers { get; init; }
	public T? Data { get; init; }
	public string? RequestId => Header(Headers, "x-request-id") ?? Header(Headers, "x-phaseo-request-id");
	public string? TraceUrl => RequestId is null ? null : "https://phaseo.app/settings/usage/logs/requests/" + Uri.EscapeDataString(RequestId);
	private static string? Header(Dictionary<string, string> headers, string name) { foreach (var pair in headers) if (string.Equals(pair.Key, name, StringComparison.OrdinalIgnoreCase)) return pair.Value; return null; }
}

public sealed class ApiErrorException : Exception
{
	public int StatusCode { get; }
	public string ResponseBody { get; }
	public Dictionary<string, string> Headers { get; }
	public Dictionary<string, object?> Payload { get; }
	public string? RequestId => PayloadString("request_id") ?? Header("x-request-id") ?? Header("x-phaseo-request-id");
	public string? GenerationId => PayloadString("generation_id") ?? RequestId;
	public string? ErrorType => PayloadString("error_type");
	public string? ErrorOrigin => PayloadString("error_origin");
	public bool? Retryable => PayloadBool("retryable");
	public string? Action => PayloadString("action");
	public string? DocsUrl => PayloadString("docs_url");
	public string? SupportUrl => PayloadString("support_url");
	public long? RetryAfterSeconds => PayloadLong("retry_after_seconds") ?? RetryAfterHeaderSeconds();
	public object? Details => Payload.TryGetValue("details", out var value) ? value : null;
	public string? TraceUrl => RequestId is null ? null : "https://phaseo.app/settings/usage/logs/requests/" + Uri.EscapeDataString(RequestId);
	public string? Code { get; }
	public TimeSpan? RetryAfter { get; }

	public ApiErrorException(int statusCode, string responseBody, Dictionary<string, string>? headers, string message)
		: base(message)
	{
		StatusCode = statusCode;
		ResponseBody = responseBody;
		Headers = headers ?? new Dictionary<string, string>();
		Payload = ParsePayload(responseBody);
		Code = ParseCode(responseBody);
		RetryAfter = ParseRetryAfter(Header("retry-after"));
	}
	private string? PayloadString(string name)
	{
		if (!Payload.TryGetValue(name, out var value) || value is null) return null;
		if (value is string text) return text;
		if (value is JsonElement element && element.ValueKind == JsonValueKind.String) return element.GetString();
		return value.ToString();
	}
	private bool? PayloadBool(string name)
	{
		if (!Payload.TryGetValue(name, out var value) || value is null) return null;
		if (value is bool boolean) return boolean;
		if (value is JsonElement element && (element.ValueKind == JsonValueKind.True || element.ValueKind == JsonValueKind.False)) return element.GetBoolean();
		return null;
	}
	private long? PayloadLong(string name)
	{
		if (!Payload.TryGetValue(name, out var value) || value is null) return null;
		if (value is long number) return number;
		if (value is int integer) return integer;
		if (value is JsonElement element && element.ValueKind == JsonValueKind.Number && element.TryGetInt64(out var parsed)) return parsed;
		return long.TryParse(value.ToString(), out var fallback) ? fallback : null;
	}
	private long? RetryAfterHeaderSeconds()
	{
		var retryAfter = RetryAfter;
		return retryAfter is null ? null : (long)Math.Ceiling(Math.Max(0, retryAfter.Value.TotalSeconds));
	}
	private static Dictionary<string, object?> ParsePayload(string body)
	{
		try { return JsonSerializer.Deserialize<Dictionary<string, object?>>(body) ?? new Dictionary<string, object?>(); }
		catch (JsonException) { return new Dictionary<string, object?>(); }
	}
	private string? Header(string name) { foreach (var pair in Headers) if (string.Equals(pair.Key, name, StringComparison.OrdinalIgnoreCase)) return pair.Value; return null; }
	private static string? ParseCode(string body) { try { using var json = JsonDocument.Parse(body); var root = json.RootElement; if (root.TryGetProperty("code", out var code) && code.ValueKind == JsonValueKind.String) return code.GetString(); if (root.TryGetProperty("error", out var error)) { if (error.ValueKind == JsonValueKind.String) return error.GetString(); if (error.ValueKind == JsonValueKind.Object && error.TryGetProperty("code", out code) && code.ValueKind == JsonValueKind.String) return code.GetString(); } } catch (JsonException) { } return null; }
	private static TimeSpan? ParseRetryAfter(string? value) { if (string.IsNullOrWhiteSpace(value)) return null; if (double.TryParse(value, out var seconds)) return TimeSpan.FromSeconds(Math.Max(0, seconds)); if (DateTimeOffset.TryParse(value, out var at)) return at <= DateTimeOffset.UtcNow ? TimeSpan.Zero : at - DateTimeOffset.UtcNow; return null; }
}

public sealed class Client
{
	private readonly HttpClient _http;
	private readonly string _baseUrl;
	private readonly Dictionary<string, string> _headers;
	private TimeSpan _timeout = TimeSpan.FromSeconds(60);
	private int _maxRetries;
	private Action<RequestEvent>? _onRequest;
	private Action<ResponseEvent>? _onResponse;
	private Action<RetryEvent>? _onRetry;

	public Client(string baseUrl, HttpClient? httpClient = null, Dictionary<string, string>? headers = null)
	{
		_baseUrl = baseUrl.TrimEnd('/');
		_http = httpClient ?? new HttpClient();
		_headers = headers ?? new Dictionary<string, string>();
	}

	public Client SetTimeout(TimeSpan timeout) { if (timeout <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(timeout)); _timeout = timeout; return this; }
	public Client SetMaxRetries(int value) { if (value < 0 || value > 10) throw new ArgumentOutOfRangeException(nameof(value)); _maxRetries = value; return this; }
	public Client SetHooks(Action<RequestEvent>? request, Action<ResponseEvent>? response, Action<RetryEvent>? retry) { _onRequest = request; _onResponse = response; _onRetry = retry; return this; }

	private HttpRequestMessage BuildRequest(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null, RequestOptions? options = null)
	{
		var url = _baseUrl + path;
		if (query != null && query.Count > 0)
		{
			var parts = new List<string>();
			foreach (var kvp in query)
			{
				parts.Add(Uri.EscapeDataString(kvp.Key) + "=" + Uri.EscapeDataString(kvp.Value));
			}
			url += "?" + string.Join("&", parts);
		}
		var request = new HttpRequestMessage(new HttpMethod(method), url);
		foreach (var kvp in _headers)
		{
			request.Headers.TryAddWithoutValidation(kvp.Key, kvp.Value);
		}
		if (headers != null)
		{
			foreach (var kvp in headers)
			{
				request.Headers.TryAddWithoutValidation(kvp.Key, kvp.Value);
			}
		}
		if (options?.Headers != null)
		{
			foreach (var kvp in options.Headers) request.Headers.TryAddWithoutValidation(kvp.Key, kvp.Value);
		}
		if (!string.IsNullOrWhiteSpace(options?.IdempotencyKey)) request.Headers.TryAddWithoutValidation("Idempotency-Key", options.IdempotencyKey);
		if (body != null)
		{
			var json = JsonSerializer.Serialize(body);
			request.Content = new StringContent(json, Encoding.UTF8, "application/json");
		}
		return request;
	}

	private static string BuildErrorMessage(int statusCode, string responseBody)
	{
		var trimmed = responseBody?.Trim();
		return string.IsNullOrWhiteSpace(trimmed)
			? $"Request failed with status code {statusCode}."
			: $"Request failed with status code {statusCode}: {trimmed}";
	}

	public async Task<T?> SendAsync<T>(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null)
	{
		return (await SendWithResponseAsync<T>(method, path, query, headers, body).ConfigureAwait(false)).Data;
	}

	public async Task<RawResponse<T>> SendWithResponseAsync<T>(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null, RequestOptions? options = null)
	{
		var rawResult = await SendRawWithResponseAsync(method, path, query, headers, body, options).ConfigureAwait(false);
		var raw = rawResult.Data.Length == 0 ? string.Empty : Encoding.UTF8.GetString(rawResult.Data);
		T? data = string.IsNullOrWhiteSpace(raw) ? default : JsonSerializer.Deserialize<T>(raw);
		return new RawResponse<T> { StatusCode = rawResult.StatusCode, Headers = rawResult.Headers, Data = data };
	}

	private async Task<RawResponse<byte[]>> SendRawWithResponseAsync(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null, RequestOptions? options = null)
	{
		var normalizedMethod = method.ToUpperInvariant();
		var retries = options?.MaxRetries ?? _maxRetries;
		if (retries < 0 || retries > 10) throw new ArgumentOutOfRangeException(nameof(options.MaxRetries));
		if (normalizedMethod != "GET" && normalizedMethod != "HEAD") retries = 0;
		using var timeout = CancellationTokenSource.CreateLinkedTokenSource(options?.CancellationToken ?? default);
		timeout.CancelAfter(options?.Timeout ?? _timeout);
		var started = DateTimeOffset.UtcNow;
		for (var attempt = 0; ; attempt++)
		{
			using var request = BuildRequest(normalizedMethod, path, query, headers, body, options);
			var requestEvent = new RequestEvent(normalizedMethod, request.RequestUri!.ToString(), attempt, options?.IdempotencyKey, DateTimeOffset.UtcNow);
			_onRequest?.Invoke(requestEvent);
			HttpResponseMessage response;
			try { response = await _http.SendAsync(request, timeout.Token).ConfigureAwait(false); }
			catch (HttpRequestException error) when (attempt < retries)
			{
				var delay = Backoff(attempt); _onRetry?.Invoke(new RetryEvent(requestEvent, null, delay, error)); await Task.Delay(delay, timeout.Token).ConfigureAwait(false); continue;
			}
			using (response)
			{
				var bytes = await response.Content.ReadAsByteArrayAsync(timeout.Token).ConfigureAwait(false);
				var raw = bytes.Length == 0 ? string.Empty : Encoding.UTF8.GetString(bytes);
				var responseHeaders = Headers(response);
				if (Retryable((int)response.StatusCode) && attempt < retries)
				{
					var delay = RetryDelay(responseHeaders, attempt); _onRetry?.Invoke(new RetryEvent(requestEvent, (int)response.StatusCode, delay, null)); await Task.Delay(delay, timeout.Token).ConfigureAwait(false); continue;
				}
				var result = new RawResponse<byte[]> { StatusCode = (int)response.StatusCode, Headers = responseHeaders, Data = bytes };
				_onResponse?.Invoke(new ResponseEvent(requestEvent, result.StatusCode, result.RequestId, DateTimeOffset.UtcNow - started));
				if (!response.IsSuccessStatusCode) throw new ApiErrorException(result.StatusCode, raw, responseHeaders, BuildErrorMessage(result.StatusCode, raw));
				return result;
			}
		}
	}

	public async Task<string> SendTextAsync(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null)
	{
		var result = await SendRawWithResponseAsync(method, path, query, headers, body).ConfigureAwait(false);
		return result.Data.Length == 0 ? string.Empty : Encoding.UTF8.GetString(result.Data);
	}

	public async Task<byte[]> SendBytesAsync(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null)
	{
		return (await SendRawWithResponseAsync(method, path, query, headers, body).ConfigureAwait(false)).Data;
	}

	public async IAsyncEnumerable<string> StreamLinesAsync(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null, [EnumeratorCancellation] CancellationToken cancellationToken = default)
	{
		var normalizedMethod = method.ToUpperInvariant();
		var retries = normalizedMethod == "GET" || normalizedMethod == "HEAD" ? _maxRetries : 0;
		using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
		timeout.CancelAfter(_timeout);
		var started = DateTimeOffset.UtcNow;
		for (var attempt = 0; ; attempt++)
		{
			using var request = BuildRequest(normalizedMethod, path, query, headers, body);
			request.Headers.TryAddWithoutValidation("Accept", "text/event-stream");
			var requestEvent = new RequestEvent(normalizedMethod, request.RequestUri!.ToString(), attempt, null, DateTimeOffset.UtcNow);
			_onRequest?.Invoke(requestEvent);
			HttpResponseMessage response;
			try { response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token).ConfigureAwait(false); }
			catch (HttpRequestException error) when (attempt < retries)
			{
				var delay = Backoff(attempt); _onRetry?.Invoke(new RetryEvent(requestEvent, null, delay, error)); await Task.Delay(delay, timeout.Token).ConfigureAwait(false); continue;
			}
			var responseHeaders = Headers(response);
			if (Retryable((int)response.StatusCode) && attempt < retries)
			{
				var delay = RetryDelay(responseHeaders, attempt); response.Dispose(); _onRetry?.Invoke(new RetryEvent(requestEvent, (int)response.StatusCode, delay, null)); await Task.Delay(delay, timeout.Token).ConfigureAwait(false); continue;
			}
			_onResponse?.Invoke(new ResponseEvent(requestEvent, (int)response.StatusCode, responseHeaders.TryGetValue("x-request-id", out var requestId) ? requestId : null, DateTimeOffset.UtcNow - started));
			if (!response.IsSuccessStatusCode)
			{
				using (response)
				{
					var raw = await response.Content.ReadAsStringAsync(timeout.Token).ConfigureAwait(false);
					throw new ApiErrorException((int)response.StatusCode, raw, responseHeaders, BuildErrorMessage((int)response.StatusCode, raw));
				}
			}
			using (response)
			{
				await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token).ConfigureAwait(false);
				using var reader = new StreamReader(stream);
				while (!reader.EndOfStream)
				{
					var line = await reader.ReadLineAsync(timeout.Token).ConfigureAwait(false);
					if (line is not null) yield return line;
				}
			}
			yield break;
		}
	}

	private static Dictionary<string, string> Headers(HttpResponseMessage response)
	{
		var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
		foreach (var pair in response.Headers) values[pair.Key] = string.Join(",", pair.Value);
		foreach (var pair in response.Content.Headers) values[pair.Key] = string.Join(",", pair.Value);
		return values;
	}
	private static bool Retryable(int status) => status is 408 or 429 or 500 or 502 or 503 or 504;
	private static TimeSpan Backoff(int attempt) => TimeSpan.FromMilliseconds(Math.Min(250 * Math.Pow(2, attempt), 5000));
	private static TimeSpan RetryDelay(Dictionary<string, string> headers, int attempt)
	{
		if (headers.TryGetValue("Retry-After", out var value)) { if (double.TryParse(value, out var seconds)) return TimeSpan.FromSeconds(Math.Max(0, seconds)); if (DateTimeOffset.TryParse(value, out var at)) return at <= DateTimeOffset.UtcNow ? TimeSpan.Zero : at - DateTimeOffset.UtcNow; }
		return Backoff(attempt);
	}
}
