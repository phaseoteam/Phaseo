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

public class AIStatsProviderOpsTest {
	@Test
	void providerAndUsageHelpersReturnPayloads() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/providers", exchange -> {
			assertEquals("GET", exchange.getRequestMethod());
			assertTrue(exchange.getRequestURI().getQuery().contains("limit=2"));
			writeJson(exchange, "{\"ok\":true,\"providers\":[{\"provider_id\":\"openai\",\"name\":\"OpenAI\"}]}");
		});
		server.createContext("/credits", exchange -> {
			assertEquals("GET", exchange.getRequestMethod());
			assertTrue(exchange.getRequestURI().getQuery().contains("team_id=team_123"));
			writeJson(exchange, "{\"ok\":true,\"credits\":{\"balance_usd\":42.5}}");
		});
		server.createContext("/activity", exchange -> {
			assertEquals("GET", exchange.getRequestMethod());
			assertTrue(exchange.getRequestURI().getQuery().contains("days=30"));
			writeJson(exchange, "{\"ok\":true,\"total\":1,\"activity\":[{\"request_id\":\"req_123\"}]}");
		});
		server.createContext("/analytics", exchange -> {
			assertEquals("GET", exchange.getRequestMethod());
			assertTrue(exchange.getRequestURI().getQuery().contains("date=2026-05-01"));
			writeJson(exchange, "{\"data\":[{\"date\":\"2026-05-01\",\"endpoint_id\":\"responses\",\"requests\":12}]}");
		});
		server.start();

		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
			AIStats client = new AIStats("test", baseUrl, false, false, null);
			JsonNode providers = client.listProviders(Map.of("limit", "2"));
			JsonNode credits = client.getCredits(Map.of("team_id", "team_123"));
			JsonNode activity = client.getActivity(Map.of("days", "30"));
			JsonNode analytics = client.getAnalytics(Map.of("date", "2026-05-01"));
			assertEquals("openai", providers.path("providers").get(0).path("provider_id").asText());
			assertEquals("42.5", credits.path("credits").path("balance_usd").asText());
			assertEquals("req_123", activity.path("activity").get(0).path("request_id").asText());
			assertEquals("responses", analytics.path("data").get(0).path("endpoint_id").asText());
		} finally {
			server.stop(0);
		}
	}

	private static void writeJson(HttpExchange exchange, String json) throws IOException {
		byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().add("Content-Type", "application/json");
		exchange.sendResponseHeaders(200, bytes.length);
		try (OutputStream os = exchange.getResponseBody()) {
			os.write(bytes);
		}
	}
}
