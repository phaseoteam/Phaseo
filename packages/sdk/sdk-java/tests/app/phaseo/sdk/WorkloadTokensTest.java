package app.phaseo.sdk;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkloadTokensTest {
	private static final ObjectMapper MAPPER = new ObjectMapper();
	private HttpServer server;
	private String baseUrl;
	private final List<Map<String, String>> requests = new CopyOnWriteArrayList<>();
	private final AtomicReference<String> responseBody = new AtomicReference<>();
	private final AtomicReference<Integer> responseStatus = new AtomicReference<>(200);
	private final AtomicLong clock = new AtomicLong(1_000);
	private final Map<String, String> env = new HashMap<>();

	@BeforeEach
	void startServer() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", this::handle);
		server.start();
		baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
	}

	@AfterEach
	void stopServer() {
		server.stop(0);
	}

	private void handle(HttpExchange exchange) throws IOException {
		Map<String, String> seen = new HashMap<>();
		seen.put("method", exchange.getRequestMethod());
		seen.put("uri", exchange.getRequestURI().toString());
		seen.put("authorization", exchange.getRequestHeaders().getFirst("Authorization"));
		seen.put("content-type", exchange.getRequestHeaders().getFirst("Content-Type"));
		seen.put("accept", exchange.getRequestHeaders().getFirst("Accept"));
		seen.put("body", new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
		requests.add(seen);
		byte[] bytes = responseBody.get().getBytes(StandardCharsets.UTF_8);
		exchange.sendResponseHeaders(responseStatus.get(), bytes.length);
		try (OutputStream os = exchange.getResponseBody()) {
			os.write(bytes);
		}
	}

	private static String jwt(Long exp) {
		String payload = exp == null ? "{\"sub\":\"repo\"}" : "{\"sub\":\"repo\",\"exp\":" + exp + "}";
		Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
		return encoder.encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8)) + "."
			+ encoder.encodeToString(payload.getBytes(StandardCharsets.UTF_8)) + ".sig";
	}

	private WorkloadTokens.GitHubActions gitHub(String audience) {
		return new WorkloadTokens.GitHubActions(audience, null, env::get, clock::get);
	}

	private WorkloadTokens.Vercel vercel(ApiKeyProvider source, String audience) {
		return new WorkloadTokens.Vercel(source, audience, null, URI.create(baseUrl + "/~token"), env::get, clock::get);
	}

	@Test
	void gitHubActionsFetchesWithAudienceAndCachesUntilNearExpiry() throws Exception {
		env.put("ACTIONS_ID_TOKEN_REQUEST_URL", baseUrl + "/token?api-version=2.0");
		env.put("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "request-token");
		String token = jwt(1_600L);
		responseBody.set("{\"value\":\"" + token + "\"}");
		ApiKeyProvider provider = gitHub(WorkloadTokens.DEFAULT_AUDIENCE);

		assertEquals(token, provider.get());
		assertEquals("GET", requests.get(0).get("method"));
		assertEquals("/token?api-version=2.0&audience=https%3A%2F%2Fapi.phaseo.app", requests.get(0).get("uri"));
		assertEquals("bearer request-token", requests.get(0).get("authorization"));

		clock.set(1_539);
		assertEquals(token, provider.get());
		assertEquals(1, requests.size());

		clock.set(1_540);
		assertEquals(token, provider.get());
		assertEquals(2, requests.size());
	}

	@Test
	void gitHubActionsUsesQuestionMarkAndDoesNotCacheWithoutExp() throws Exception {
		env.put("ACTIONS_ID_TOKEN_REQUEST_URL", baseUrl + "/token");
		env.put("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "request-token");
		responseBody.set("{\"value\":\"" + jwt(null) + "\"}");
		ApiKeyProvider provider = gitHub("custom aud");
		provider.get();
		provider.get();
		assertEquals("/token?audience=custom+aud", requests.get(0).get("uri"));
		assertEquals(2, requests.size());
	}

	@Test
	void gitHubActionsWithoutEnvAsksForIdTokenPermission() {
		IllegalStateException error = assertThrows(IllegalStateException.class, () -> gitHub(WorkloadTokens.DEFAULT_AUDIENCE).get());
		assertTrue(error.getMessage().contains("id-token: write"));
	}

	@Test
	void gitHubActionsErrorsIncludeStatusButNoTokens() {
		env.put("ACTIONS_ID_TOKEN_REQUEST_URL", baseUrl + "/token");
		env.put("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "request-token");
		responseStatus.set(403);
		responseBody.set("{\"message\":\"denied\"}");
		IOException error = assertThrows(IOException.class, () -> gitHub(WorkloadTokens.DEFAULT_AUDIENCE).get());
		assertTrue(error.getMessage().contains("403"));
		assertFalse(error.getMessage().contains("request-token"));

		responseStatus.set(200);
		responseBody.set("{}");
		assertThrows(IOException.class, () -> gitHub(WorkloadTokens.DEFAULT_AUDIENCE).get());
	}

	@Test
	void vercelExchangesTheFileTokenAndCachesUntilNearExpiry() throws Exception {
		Path file = Files.createTempFile("vercel-oidc", ".txt");
		try {
			Files.writeString(file, "  file-source \n");
			env.put("VERCEL_OIDC_TOKEN_FILE", file.toString());
			env.put("VERCEL_OIDC_TOKEN", "env-source");
			responseBody.set("{\"token\":\"exchanged\",\"expiry\":2000}");
			ApiKeyProvider provider = vercel(null, "https://api.phaseo.app");

			assertEquals("exchanged", provider.get());
			Map<String, String> seen = requests.get(0);
			assertEquals("POST", seen.get("method"));
			assertEquals("/~token", seen.get("uri"));
			assertEquals("application/json", seen.get("content-type"));
			assertEquals("application/json", seen.get("accept"));
			JsonNode body = MAPPER.readTree(seen.get("body"));
			assertEquals("file-source", body.path("token").asText());
			assertEquals("https://api.phaseo.app", body.path("aud").asText());

			clock.set(1_939);
			provider.get();
			assertEquals(1, requests.size());
			clock.set(1_940);
			provider.get();
			assertEquals(2, requests.size());

			// A different source token is exchanged again even while the old one is fresh.
			clock.set(1_000);
			Files.writeString(file, "rotated-source");
			provider.get();
			assertEquals(3, requests.size());
			assertEquals("rotated-source", MAPPER.readTree(requests.get(2).get("body")).path("token").asText());
		} finally {
			Files.deleteIfExists(file);
		}
	}

	@Test
	void vercelReadsTheEnvTokenAndFallsBackToJwtExp() throws Exception {
		env.put("VERCEL_OIDC_TOKEN", "env-source");
		String token = jwt(1_300L);
		responseBody.set("{\"token\":\"" + token + "\"}");
		ApiKeyProvider provider = vercel(null, "aud-1");
		assertEquals(token, provider.get());
		assertEquals("env-source", MAPPER.readTree(requests.get(0).get("body")).path("token").asText());
		clock.set(1_239);
		provider.get();
		assertEquals(1, requests.size());
		clock.set(1_240);
		provider.get();
		assertEquals(2, requests.size());
	}

	@Test
	void vercelUsesAnExplicitSourceProvider() throws Exception {
		responseBody.set("{\"token\":\"exchanged\"}");
		ApiKeyProvider provider = vercel(() -> "header-source", "aud-1");
		provider.get();
		provider.get();
		assertEquals("header-source", MAPPER.readTree(requests.get(0).get("body")).path("token").asText());
		assertEquals(2, requests.size(), "no expiry and no JWT exp means no cache");
	}

	@Test
	void vercelSurfacesTheErrorMessage() {
		env.put("VERCEL_OIDC_TOKEN", "env-source");
		responseStatus.set(400);
		responseBody.set("{\"error\":\"token audience is not allowed\"}");
		IOException error = assertThrows(IOException.class, () -> vercel(null, "aud-1").get());
		assertTrue(error.getMessage().contains("token audience is not allowed"));

		responseBody.set("not json");
		error = assertThrows(IOException.class, () -> vercel(null, "aud-1").get());
		assertTrue(error.getMessage().contains("400"));
		assertFalse(error.getMessage().contains("env-source"));
	}

	@Test
	void vercelWithoutSourceFails() {
		IllegalStateException error = assertThrows(IllegalStateException.class, () -> vercel(null, "aud-1").get());
		assertTrue(error.getMessage().contains("VERCEL_OIDC_TOKEN"));
		assertTrue(requests.isEmpty());
	}

	@Test
	void publicFactoriesDefaultTheAudience() {
		assertTrue(WorkloadTokens.gitHubActions() instanceof WorkloadTokens.GitHubActions);
		assertTrue(WorkloadTokens.vercel() instanceof WorkloadTokens.Vercel);
		assertThrows(IllegalArgumentException.class, () -> WorkloadTokens.vercel(" ", null));
	}

	@Test
	void phaseoClientSendsTheWorkloadToken() throws Exception {
		env.put("ACTIONS_ID_TOKEN_REQUEST_URL", baseUrl + "/token");
		env.put("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "request-token");
		String token = jwt(5_000L);
		responseBody.set("{\"value\":\"" + token + "\"}");
		Phaseo.withApiKeyProvider(gitHub(WorkloadTokens.DEFAULT_AUDIENCE), baseUrl).healthz();
		assertEquals("Bearer " + token, requests.get(1).get("authorization"));
	}
}
