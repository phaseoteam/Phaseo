import app.phaseo.gen.Client;
import app.phaseo.sdk.Phaseo;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class PhaseoCoreContractTest {
	@Test
	void retriesSafeReadsAndPreservesMetadataWithoutRetryingWrites() throws Exception {
		AtomicInteger reads = new AtomicInteger();
		AtomicInteger writes = new AtomicInteger();
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/read", exchange -> {
			if (reads.incrementAndGet() == 1) {
				exchange.getResponseHeaders().add("Retry-After", "0");
				respond(exchange, 429, "");
				return;
			}
			exchange.getResponseHeaders().add("X-Request-Id", "req_java_core");
			respond(exchange, 200, "{\"ok\":true}");
		});
		server.createContext("/write", exchange -> {
			writes.incrementAndGet();
			assertEquals("idem_java", exchange.getRequestHeaders().getFirst("Idempotency-Key"));
			exchange.getResponseHeaders().add("X-Request-Id", "req_java_error");
			respond(exchange, 503, "{\"error\":{\"code\":\"temporarily_unavailable\"}}");
		});
		server.start();

		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
			Phaseo phaseo = new Phaseo("test", baseUrl, false, false, null).setTimeout(Duration.ofSeconds(2)).setMaxRetries(2);
			AtomicInteger retries = new AtomicInteger();
			phaseo.setRequestHooks(event -> {}, event -> {}, event -> retries.incrementAndGet());
			Client.RawResponse<String> response = phaseo.requestWithResponse("GET", "/read", null, null, null, null);
			assertEquals(2, reads.get());
			assertEquals(1, retries.get());
			assertEquals("req_java_core", response.requestId());
			assertNotNull(response.traceUrl());

			Client.RequestOptions options = new Client.RequestOptions();
			options.idempotencyKey = "idem_java";
			Client.ApiException error = assertThrows(Client.ApiException.class, () -> phaseo.requestWithResponse("POST", "/write", null, null, Map.of("model", "test"), options));
			assertEquals(1, writes.get());
			assertEquals(503, error.getStatusCode());
			assertEquals("req_java_error", error.getRequestId());
			assertEquals("temporarily_unavailable", error.getCode());
		} finally {
			server.stop(0);
		}
	}

	private static void respond(HttpExchange exchange, int status, String body) throws IOException {
		byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
		exchange.sendResponseHeaders(status, bytes.length);
		try (OutputStream output = exchange.getResponseBody()) {
			output.write(bytes);
		}
	}
}
