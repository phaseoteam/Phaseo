import ai.stats.sdk.AIStats;
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

public class AIStatsGenerationTest {
	@Test
	void getGenerationReturnsPayload() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/generation", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				assertEquals("id=gen_123", exchange.getRequestURI().getQuery());
				byte[] bytes = "{\"id\":\"gen_123\",\"provider\":\"openai\",\"request_id\":\"req_java_generation_1\",\"status_code\":200}".getBytes(StandardCharsets.UTF_8);
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
			JsonNode response = client.getGeneration("gen_123");
			assertEquals("gen_123", response.path("id").asText());
			assertEquals("openai", response.path("provider").asText());
			assertEquals("req_java_generation_1", response.path("request_id").asText());
		} finally {
			server.stop(0);
		}
	}
}
