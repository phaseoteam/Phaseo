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

public class AIStatsWorkspacesTest {
	@Test
	void listAndGetWorkspacesReturnPayloads() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/workspaces", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				String query = exchange.getRequestURI().getQuery();
				assertTrue(query.contains("limit=2"));
				assertTrue(query.contains("offset=3"));
				byte[] bytes = "{\"object\":\"list\",\"data\":[{\"id\":\"ws_123\",\"slug\":\"default\"},{\"id\":\"ws_456\",\"slug\":\"sandbox\"}]}".getBytes(StandardCharsets.UTF_8);
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/workspaces/ws_123", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				byte[] bytes = "{\"data\":{\"id\":\"ws_123\",\"slug\":\"default\",\"name\":\"Default Workspace\"}}".getBytes(StandardCharsets.UTF_8);
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
			JsonNode listed = client.listWorkspaces(Map.of("limit", "2", "offset", "3"));
			JsonNode retrieved = client.getWorkspace("ws_123");
			assertEquals("list", listed.path("object").asText());
			assertEquals("ws_123", retrieved.path("data").path("id").asText());
			assertEquals("default", retrieved.path("data").path("slug").asText());
		} finally {
			server.stop(0);
		}
	}
}
