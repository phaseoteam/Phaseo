import app.phaseo.sdk.Phaseo;
import com.fasterxml.jackson.databind.JsonNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class PhaseoHealthTest {
	@Test
	void healthReturnsPayload() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/health", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				byte[] bytes = "{\"status\":\"ok\",\"timestamp\":\"2026-05-05T12:00:00.000Z\"}".getBytes(StandardCharsets.UTF_8);
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.start();

		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
			Phaseo client = new Phaseo("test", baseUrl, false, false, null);
			JsonNode response = client.healthz();
			assertEquals("ok", response.path("status").asText());
			assertEquals("2026-05-05T12:00:00.000Z", response.path("timestamp").asText());
		} finally {
			server.stop(0);
		}
	}
}
