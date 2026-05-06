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

public class AIStatsPricingModelsTest {
	@Test
	void listPricingModelsReturnsPayload() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/pricing/models", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				assertEquals("provider=openai", exchange.getRequestURI().getQuery());
				byte[] bytes = "{\"ok\":true,\"models\":[{\"provider\":\"openai\",\"model\":\"openai/gpt-5-mini\",\"endpoint\":\"responses\",\"display_name\":\"GPT-5 Mini\",\"meters\":[{\"meter\":\"input_tokens\",\"unit\":\"tokens\",\"unit_size\":1000,\"price_per_unit\":\"0.00025\",\"currency\":\"USD\"}]}]}".getBytes(StandardCharsets.UTF_8);
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
			JsonNode response = client.listPricingModels(Map.of("provider", "openai"));
			assertTrue(response.path("ok").asBoolean());
			assertEquals("openai", response.path("models").get(0).path("provider").asText());
		} finally {
			server.stop(0);
		}
	}
}
