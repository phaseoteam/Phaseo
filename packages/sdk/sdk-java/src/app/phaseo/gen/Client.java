package app.phaseo.gen;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class Client {
	private final String baseUrl;
	private final HttpClient http;
	private final Map<String, String> headers;

	public static final class ApiException extends IOException {
		private final int statusCode;
		private final String responseBody;

		public ApiException(int statusCode, String responseBody, String message) {
			super(message);
			this.statusCode = statusCode;
			this.responseBody = responseBody;
		}

		public int getStatusCode() {
			return statusCode;
		}

		public String getResponseBody() {
			return responseBody;
		}
	}

	public Client(String baseUrl) {
		this(baseUrl, HttpClient.newHttpClient(), new HashMap<>());
	}

	public Client(String baseUrl, HttpClient http, Map<String, String> headers) {
		this.baseUrl = baseUrl.replaceAll("/+$", "");
		this.http = http;
		this.headers = headers;
	}

	private HttpRequest buildRequest(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body) {
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
		HttpRequest request = buildRequest(method, path, query, extraHeaders, body);
		HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
		if (response.statusCode() >= 400) {
			throw new ApiException(response.statusCode(), response.body(), buildErrorMessage(response.statusCode(), response.body()));
		}
		return response.body();
	}

	public byte[] requestBytes(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body) throws IOException, InterruptedException {
		HttpRequest request = buildRequest(method, path, query, extraHeaders, body);
		HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
		if (response.statusCode() >= 400) {
			String raw = new String(response.body(), StandardCharsets.UTF_8);
			throw new ApiException(response.statusCode(), raw, buildErrorMessage(response.statusCode(), raw));
		}
		return response.body();
	}

}
