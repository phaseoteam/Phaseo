package app.phaseo.sdk;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;
import java.util.function.LongSupplier;

/**
 * {@link ApiKeyProvider}s for trusted workloads (beta): a GitHub Actions job or a Vercel
 * deployment calls Phaseo with its short-lived OIDC token instead of an API key. Set up a
 * trust policy in Settings &rarr; API Keys &rarr; Trusted workloads first.
 *
 * <pre>{@code
 * Phaseo client = Phaseo.withApiKeyProvider(WorkloadTokens.gitHubActions());
 * }</pre>
 *
 * Each provider reuses its token until 60 seconds before it expires, then fetches a new one.
 */
public final class WorkloadTokens {
	public static final String DEFAULT_AUDIENCE = "https://api.phaseo.app";
	static final URI VERCEL_TOKEN_URL = URI.create("https://oidc.vercel.com/~token");
	private static final Duration TIMEOUT = Duration.ofSeconds(10);
	private static final long REFRESH_MARGIN_SECONDS = 60;
	private static final ObjectMapper MAPPER = new ObjectMapper();

	private WorkloadTokens() {}

	/** GitHub Actions OIDC token for {@value #DEFAULT_AUDIENCE}. The job needs {@code permissions: id-token: write}. */
	public static ApiKeyProvider gitHubActions() {
		return gitHubActions(DEFAULT_AUDIENCE);
	}

	/** GitHub Actions OIDC token for {@code audience}. The job needs {@code permissions: id-token: write}. */
	public static ApiKeyProvider gitHubActions(String audience) {
		return new GitHubActions(audienceOrDefault(audience), null, System::getenv, WorkloadTokens::nowSeconds);
	}

	/**
	 * Vercel OIDC token exchanged for {@value #DEFAULT_AUDIENCE}. The source token is read from the
	 * file named by {@code VERCEL_OIDC_TOKEN_FILE}, otherwise from {@code VERCEL_OIDC_TOKEN}.
	 */
	public static ApiKeyProvider vercel() {
		return vercel(DEFAULT_AUDIENCE);
	}

	/** Like {@link #vercel()}, for {@code audience}. */
	public static ApiKeyProvider vercel(String audience) {
		return vercel((ApiKeyProvider) null, audience);
	}

	/** Exchanges a fixed Vercel OIDC token, for example from the {@code x-vercel-oidc-token} request header. */
	public static ApiKeyProvider vercel(String sourceToken, String audience) {
		if (sourceToken == null || sourceToken.isBlank()) {
			throw new IllegalArgumentException("sourceToken is required");
		}
		return vercel(() -> sourceToken, audience);
	}

	/** Exchanges the Vercel OIDC token returned by {@code sourceToken} on each call; null reads the environment. */
	public static ApiKeyProvider vercel(ApiKeyProvider sourceToken, String audience) {
		return new Vercel(sourceToken, audienceOrDefault(audience), null, VERCEL_TOKEN_URL, System::getenv, WorkloadTokens::nowSeconds);
	}

	static final class GitHubActions implements ApiKeyProvider {
		private final String audience;
		private final HttpClient http;
		private final Function<String, String> env;
		private final LongSupplier clock;
		private String token;
		private long refreshAt;

		GitHubActions(String audience, HttpClient http, Function<String, String> env, LongSupplier clock) {
			this.audience = audience;
			this.http = http == null ? defaultHttpClient() : http;
			this.env = env;
			this.clock = clock;
		}

		@Override
		public synchronized String get() throws IOException, InterruptedException {
			if (token != null && clock.getAsLong() < refreshAt) {
				return token;
			}
			String requestUrl = blankToNull(env.apply("ACTIONS_ID_TOKEN_REQUEST_URL"));
			String requestToken = blankToNull(env.apply("ACTIONS_ID_TOKEN_REQUEST_TOKEN"));
			if (requestUrl == null || requestToken == null) {
				throw new IllegalStateException(
					"GitHub Actions OIDC is not available: ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN are not set. "
						+ "Give the job `permissions: id-token: write`."
				);
			}
			String url = requestUrl + (requestUrl.contains("?") ? "&" : "?")
				+ "audience=" + URLEncoder.encode(audience, StandardCharsets.UTF_8);
			HttpRequest request = HttpRequest.newBuilder(URI.create(url))
				.timeout(TIMEOUT)
				.header("Authorization", "bearer " + requestToken)
				.header("Accept", "application/json")
				.GET()
				.build();
			HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
			if (response.statusCode() < 200 || response.statusCode() >= 300) {
				throw new IOException("GitHub Actions OIDC token request failed with status " + response.statusCode());
			}
			String value = blankToNull(readJson(response.body(), "GitHub Actions OIDC token response").path("value").asText(null));
			if (value == null) {
				throw new IOException("GitHub Actions OIDC token response has no value");
			}
			Long exp = jwtExpiry(value);
			token = exp == null ? null : value;
			refreshAt = exp == null ? 0 : exp - REFRESH_MARGIN_SECONDS;
			return value;
		}
	}

	static final class Vercel implements ApiKeyProvider {
		private final ApiKeyProvider sourceToken;
		private final String audience;
		private final HttpClient http;
		private final URI tokenUrl;
		private final Function<String, String> env;
		private final LongSupplier clock;
		private String cachedSource;
		private String token;
		private long refreshAt;

		Vercel(ApiKeyProvider sourceToken, String audience, HttpClient http, URI tokenUrl, Function<String, String> env, LongSupplier clock) {
			this.sourceToken = sourceToken;
			this.audience = audience;
			this.http = http == null ? defaultHttpClient() : http;
			this.tokenUrl = tokenUrl;
			this.env = env;
			this.clock = clock;
		}

		@Override
		public synchronized String get() throws Exception {
			String source = resolveSource();
			if (token != null && source.equals(cachedSource) && clock.getAsLong() < refreshAt) {
				return token;
			}
			Map<String, String> body = new LinkedHashMap<>();
			body.put("token", source);
			body.put("aud", audience);
			HttpRequest request = HttpRequest.newBuilder(tokenUrl)
				.timeout(TIMEOUT)
				.header("Content-Type", "application/json")
				.header("Accept", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(MAPPER.writeValueAsString(body)))
				.build();
			HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
			if (response.statusCode() < 200 || response.statusCode() >= 300) {
				String error = null;
				try {
					error = blankToNull(MAPPER.readTree(response.body()).path("error").asText(null));
				} catch (IOException ignored) {
					// Not JSON; report the status instead.
				}
				throw new IOException(error == null
					? "Vercel OIDC token exchange failed with status " + response.statusCode()
					: "Vercel OIDC token exchange failed: " + error);
			}
			JsonNode json = readJson(response.body(), "Vercel OIDC token exchange response");
			String value = blankToNull(json.path("token").asText(null));
			if (value == null) {
				throw new IOException("Vercel OIDC token exchange response has no token");
			}
			Long expiry = json.path("expiry").isNumber() ? Long.valueOf(json.path("expiry").asLong()) : jwtExpiry(value);
			cachedSource = expiry == null ? null : source;
			token = expiry == null ? null : value;
			refreshAt = expiry == null ? 0 : expiry - REFRESH_MARGIN_SECONDS;
			return value;
		}

		private String resolveSource() throws Exception {
			String source;
			if (sourceToken != null) {
				source = blankToNull(sourceToken.get());
			} else {
				String file = blankToNull(env.apply("VERCEL_OIDC_TOKEN_FILE"));
				source = file != null
					? blankToNull(Files.readString(Path.of(file), StandardCharsets.UTF_8))
					: blankToNull(env.apply("VERCEL_OIDC_TOKEN"));
			}
			if (source == null) {
				throw new IllegalStateException(
					"Vercel OIDC token is not available: pass a source token or set VERCEL_OIDC_TOKEN_FILE or VERCEL_OIDC_TOKEN."
				);
			}
			return source;
		}
	}

	/** Reads the {@code exp} claim (unix seconds) from a JWT without checking its signature; null if unreadable. */
	static Long jwtExpiry(String jwt) {
		String[] parts = jwt.split("\\.");
		if (parts.length < 2) {
			return null;
		}
		try {
			JsonNode exp = MAPPER.readTree(Base64.getUrlDecoder().decode(parts[1])).path("exp");
			return exp.isNumber() ? Long.valueOf(exp.asLong()) : null;
		} catch (IOException | IllegalArgumentException ignored) {
			return null;
		}
	}

	private static JsonNode readJson(String body, String label) throws IOException {
		try {
			return MAPPER.readTree(body == null ? "" : body);
		} catch (IOException error) {
			throw new IOException(label + " is not valid JSON");
		}
	}

	private static String audienceOrDefault(String audience) {
		return audience == null || audience.isBlank() ? DEFAULT_AUDIENCE : audience.trim();
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	private static long nowSeconds() {
		return System.currentTimeMillis() / 1000L;
	}

	private static HttpClient defaultHttpClient() {
		return HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
	}
}
