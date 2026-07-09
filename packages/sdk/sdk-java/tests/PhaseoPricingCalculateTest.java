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
import static org.junit.jupiter.api.Assertions.assertTrue;

public class PhaseoPricingCalculateTest {
	@Test
	void calculatePricingReturnsPayload() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/pricing/calculate", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("POST", exchange.getRequestMethod());
				String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
				assertTrue(body.contains("\"provider\":\"openai\""));
				assertTrue(body.contains("\"model\":\"openai/gpt-5-mini\""));
				byte[] bytes = "{\"ok\":true,\"pricing\":{\"total_cost_usd\":0.00025,\"currency\":\"USD\"}}".getBytes(StandardCharsets.UTF_8);
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
			JsonNode response = client.calculatePricing(Map.of(
				"provider", "openai",
				"model", "openai/gpt-5-mini",
				"endpoint", "responses",
				"usage", Map.of("input_tokens", 1000)
			));
			assertTrue(response.path("ok").asBoolean());
			assertEquals(0.00025d, response.path("pricing").path("total_cost_usd").asDouble(), 0.0d);
		} finally {
			server.stop(0);
		}
	}
}
