using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace AiStats.Gen;

public sealed class ApiErrorException : Exception
{
	public int StatusCode { get; }
	public string ResponseBody { get; }

	public ApiErrorException(int statusCode, string responseBody, string message)
		: base(message)
	{
		StatusCode = statusCode;
		ResponseBody = responseBody;
	}
}

public sealed class Client
{
	private readonly HttpClient _http;
	private readonly string _baseUrl;
	private readonly Dictionary<string, string> _headers;

	public Client(string baseUrl, HttpClient? httpClient = null, Dictionary<string, string>? headers = null)
	{
		_baseUrl = baseUrl.TrimEnd('/');
		_http = httpClient ?? new HttpClient();
		_headers = headers ?? new Dictionary<string, string>();
	}

	private HttpRequestMessage BuildRequest(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null)
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
		var request = BuildRequest(method, path, query, headers, body);
		var response = await _http.SendAsync(request).ConfigureAwait(false);
		var raw = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
		if (!response.IsSuccessStatusCode)
		{
			throw new ApiErrorException((int)response.StatusCode, raw, BuildErrorMessage((int)response.StatusCode, raw));
		}
		if (string.IsNullOrWhiteSpace(raw))
		{
			return default;
		}
		return JsonSerializer.Deserialize<T>(raw);
	}

	public async Task<byte[]> SendBytesAsync(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null)
	{
		var request = BuildRequest(method, path, query, headers, body);
		var response = await _http.SendAsync(request).ConfigureAwait(false);
		var bytes = await response.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
		if (!response.IsSuccessStatusCode)
		{
			var raw = bytes.Length == 0 ? string.Empty : Encoding.UTF8.GetString(bytes);
			throw new ApiErrorException((int)response.StatusCode, raw, BuildErrorMessage((int)response.StatusCode, raw));
		}
		return bytes;
	}
}
