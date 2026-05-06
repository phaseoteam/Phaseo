import ai.stats.sdk.AIStats;
import com.fasterxml.jackson.databind.JsonNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class AIStatsApiKeyMutationsTest {
	@Test
	void apiKeyMutationHelpersReturnPayloads() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/keys", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes;
				if ("POST".equals(exchange.getRequestMethod()) && "/keys".equals(exchange.getRequestURI().getPath())) {
					bytes = "{\"data\":{\"id\":\"key_123\",\"name\":\"Admin Key\",\"status\":\"active\"}}".getBytes(StandardCharsets.UTF_8);
				} else if ("PATCH".equals(exchange.getRequestMethod()) && "/keys/key_123".equals(exchange.getRequestURI().getPath())) {
					bytes = "{\"data\":{\"id\":\"key_123\",\"name\":\"Renamed Key\",\"status\":\"disabled\"}}".getBytes(StandardCharsets.UTF_8);
				} else if ("DELETE".equals(exchange.getRequestMethod()) && "/keys/key_123".equals(exchange.getRequestURI().getPath())) {
					bytes = "{\"data\":{\"id\":\"key_123\",\"deleted\":true}}".getBytes(StandardCharsets.UTF_8);
				} else {
					bytes = "{\"error\":\"not found\"}".getBytes(StandardCharsets.UTF_8);
					exchange.sendResponseHeaders(404, bytes.length);
					try (OutputStream os = exchange.getResponseBody()) {
						os.write(bytes);
					}
					return;
				}
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
			AIStats client = new AIStats("test", baseUrl, false, false, null);
			JsonNode created = client.createApiKey(Map.of("name", "Admin Key", "scopes", new String[] { "gateway:read" }));
			JsonNode updated = client.updateApiKey("key_123", Map.of("name", "Renamed Key", "disabled", true));
			JsonNode deleted = client.deleteApiKey("key_123");
			assertEquals("active", created.path("data").path("status").asText());
			assertEquals("disabled", updated.path("data").path("status").asText());
			assertEquals("true", deleted.path("data").path("deleted").asText());
		} finally {
			server.stop(0);
		}
	}
}
