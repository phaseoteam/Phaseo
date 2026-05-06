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
import static org.junit.jupiter.api.Assertions.assertTrue;

public class AIStatsTeamModelsTest {
	@Test
	void listTeamModelsReturnsPayload() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/gateway/models/me", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				String query = exchange.getRequestURI().getQuery();
				assertTrue(query.contains("endpoints=responses"));
				assertTrue(query.contains("limit=2"));
				byte[] bytes = "{\"ok\":true,\"limit\":2,\"models\":[{\"id\":\"openai/gpt-5-mini\",\"endpoints\":[\"responses\"]}]}".getBytes(StandardCharsets.UTF_8);
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
			JsonNode response = client.listTeamModels(Map.of("endpoints", "responses", "limit", "2"));
			assertTrue(response.path("ok").asBoolean());
			assertEquals("openai/gpt-5-mini", response.path("models").get(0).path("id").asText());
		} finally {
			server.stop(0);
		}
	}
}
