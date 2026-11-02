import app.phaseo.gen.Client;
import app.phaseo.sdk.ApiKeyProvider;
import app.phaseo.sdk.Phaseo;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class PhaseoApiKeyProviderTest {
	private HttpServer server;
	private String baseUrl;
	private final List<String> authorizations = new CopyOnWriteArrayList<>();
	private final AtomicInteger failuresLeft = new AtomicInteger();

	@BeforeEach
	void startServer() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/health", exchange -> {
			authorizations.add(String.valueOf(exchange.getRequestHeaders().getFirst("Authorization")));
			boolean fail = failuresLeft.getAndUpdate(value -> Math.max(0, value - 1)) > 0;
			byte[] bytes = (fail ? "{\"error\":\"busy\"}" : "{\"status\":\"ok\"}").getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().add("Content-Type", "application/json");
			if (fail) exchange.getResponseHeaders().add("Retry-After", "0");
			exchange.sendResponseHeaders(fail ? 503 : 200, bytes.length);
			try (OutputStream os = exchange.getResponseBody()) {
				os.write(bytes);
			}
		});
		server.start();
		baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
	}

	@AfterEach
	void stopServer() {
		server.stop(0);
	}

	private static ApiKeyProvider counting(AtomicInteger calls) {
		return () -> " token-" + calls.incrementAndGet() + " ";
	}

	@Test
	void eachRequestCallsTheProvider() throws Exception {
		AtomicInteger calls = new AtomicInteger();
		Phaseo client = Phaseo.withApiKeyProvider(counting(calls), baseUrl);
		client.healthz();
		client.healthz();
		assertEquals(List.of("Bearer token-1", "Bearer token-2"), authorizations);
	}

	@Test
	void retriesCallTheProviderAgain() throws Exception {
		AtomicInteger calls = new AtomicInteger();
		Phaseo client = Phaseo.withApiKeyProvider(counting(calls), baseUrl).setMaxRetries(1);
		failuresLeft.set(1);
		assertEquals("ok", client.healthz().path("status").asText());
		assertEquals(List.of("Bearer token-1", "Bearer token-2"), authorizations);
	}

	@Test
	void blankCredentialFailsWithoutSending() {
		Phaseo client = Phaseo.withApiKeyProvider(() -> "   ", baseUrl);
		IllegalStateException error = assertThrows(IllegalStateException.class, client::healthz);
		assertTrue(error.getMessage().contains("empty credential"));
		assertTrue(authorizations.isEmpty());
	}

	@Test
	void providerErrorsPropagateWithoutSending() {
		IOException failure = new IOException("token endpoint down");
		Phaseo client = Phaseo.withApiKeyProvider(() -> { throw failure; }, baseUrl);
		assertSame(failure, assertThrows(IOException.class, client::healthz));
		assertTrue(authorizations.isEmpty());
	}

	@Test
	void perRequestAuthorizationWinsAndSkipsTheProvider() throws Exception {
		Phaseo client = Phaseo.withApiKeyProvider(() -> { throw new AssertionError("provider should not be called"); }, baseUrl);
		client.rawClient().request("GET", "/health", null, Map.of("Authorization", "Bearer per-request"), null);
		Client.RequestOptions options = new Client.RequestOptions();
		options.headers = Map.of("authorization", "Bearer from-options");
		client.requestWithResponse("GET", "/health", null, null, null, options);
		assertEquals(List.of("Bearer per-request", "Bearer from-options"), authorizations);
	}

	@Test
	void staticKeysAreUnchanged() throws Exception {
		new Phaseo("static-key", baseUrl).healthz();
		assertEquals(List.of("Bearer static-key"), authorizations);
	}

	@Test
	void nullKeyConstructorsStillCompile() {
		// `new Phaseo(null, url)` falls back to PHASEO_API_KEY; a provider overload would make it ambiguous.
		java.util.function.Supplier<Phaseo> fromEnvironment = () -> new Phaseo(null, baseUrl);
		java.util.function.Supplier<Phaseo> fromEnvironmentDefaultUrl = () -> new Phaseo(null);
		assertTrue(fromEnvironment != null && fromEnvironmentDefaultUrl != null);
	}

	@Test
	void streamingAndByteRequestsUseTheProvider() throws Exception {
		AtomicInteger calls = new AtomicInteger();
		Phaseo client = Phaseo.withApiKeyProvider(counting(calls), baseUrl);
		client.rawClient().requestBytes("GET", "/health", null, null, null);
		try (var lines = client.rawClient().requestLines("GET", "/health", null, null, null)) {
			lines.forEach(line -> { });
		}
		assertEquals(List.of("Bearer token-1", "Bearer token-2"), authorizations);
	}
}
