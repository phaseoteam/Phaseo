package ai.stats.gen;

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

	public Client(String baseUrl) {
		this(baseUrl, HttpClient.newHttpClient(), new HashMap<>());
	}

	public Client(String baseUrl, HttpClient http, Map<String, String> headers) {
		this.baseUrl = baseUrl.replaceAll("/+$", "");
		this.http = http;
		this.headers = headers;
	}

	public String request(String method, String path, Map<String, String> query, Map<String, String> extraHeaders, String body) throws IOException, InterruptedException {
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
		HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
		if (response.statusCode() >= 400) {
			throw new IOException("Request failed: " + response.statusCode());
		}
		return response.body();
	}
}
