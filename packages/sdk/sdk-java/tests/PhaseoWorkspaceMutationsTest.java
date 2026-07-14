import app.phaseo.sdk.Phaseo;
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

public class PhaseoWorkspaceMutationsTest {
	@Test
	void workspaceMutationHelpersReturnPayloads() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/workspaces", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes;
				if ("POST".equals(exchange.getRequestMethod()) && "/workspaces".equals(exchange.getRequestURI().getPath())) {
					bytes = "{\"data\":{\"id\":\"ws_123\",\"slug\":\"sandbox\",\"name\":\"Sandbox Workspace\"}}".getBytes(StandardCharsets.UTF_8);
				} else if ("PATCH".equals(exchange.getRequestMethod()) && "/workspaces/ws_123".equals(exchange.getRequestURI().getPath())) {
					bytes = "{\"data\":{\"id\":\"ws_123\",\"slug\":\"sandbox\",\"name\":\"Renamed Workspace\",\"archived\":true}}".getBytes(StandardCharsets.UTF_8);
				} else if ("DELETE".equals(exchange.getRequestMethod()) && "/workspaces/ws_123".equals(exchange.getRequestURI().getPath())) {
					bytes = "{\"data\":{\"id\":\"ws_123\",\"deleted\":true}}".getBytes(StandardCharsets.UTF_8);
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
			Phaseo client = new Phaseo("test", baseUrl, false, false, null);
			JsonNode created = client.createWorkspace(Map.of("name", "Sandbox Workspace", "slug", "sandbox"));
			JsonNode updated = client.updateWorkspace("ws_123", Map.of("name", "Renamed Workspace", "archived", true));
			JsonNode deleted = client.deleteWorkspace("ws_123");
			assertEquals("sandbox", created.path("data").path("slug").asText());
			assertEquals("true", updated.path("data").path("archived").asText());
			assertEquals("true", deleted.path("data").path("deleted").asText());
		} finally {
			server.stop(0);
		}
	}
}
