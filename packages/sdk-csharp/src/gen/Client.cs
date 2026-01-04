using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace AiStats.Gen;

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

	public async Task<T?> SendAsync<T>(string method, string path, Dictionary<string, string>? query = null, Dictionary<string, string>? headers = null, object? body = null)
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
		var response = await _http.SendAsync(request).ConfigureAwait(false);
		response.EnsureSuccessStatusCode();
		var raw = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
		if (string.IsNullOrWhiteSpace(raw))
		{
			return default;
		}
		return JsonSerializer.Deserialize<T>(raw);
	}
}
