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

public class PhaseoModelsTest {
	@Test
	void listModelsPreservesAvailabilityReason() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/models", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				String query = exchange.getRequestURI().getQuery();
				assertTrue(query.contains("availability=all"));
				byte[] bytes = "{\"ok\":true,\"availability_mode\":\"all\",\"models\":[{\"id\":\"openai/gpt-5-mini\",\"providers\":[{\"api_provider_id\":\"openai\",\"availability_status\":\"coming_soon\",\"availability_reason\":\"scheduled\"}]}]}".getBytes(StandardCharsets.UTF_8);
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
			JsonNode response = client.listModels(Map.of("availability", "all"));
			assertEquals("all", response.path("availability_mode").asText());
			JsonNode provider = response.path("models").get(0).path("providers").get(0);
			assertEquals("coming_soon", provider.path("availability_status").asText());
			assertEquals("scheduled", provider.path("availability_reason").asText());
		} finally {
			server.stop(0);
		}
	}

	@Test
	void parameterSupportHighlightsInvalidValue() throws Exception {
		JsonNode model = new com.fasterxml.jackson.databind.ObjectMapper().readTree("{\"id\":\"openai/example\",\"endpoints\":[{\"id\":\"openai:responses\",\"endpoint\":\"responses\",\"routable\":true,\"status\":\"active\",\"provider\":{\"id\":\"openai\"},\"capabilities\":{\"parameters\":[\"temperature\"],\"parameter_details\":{\"temperature\":{\"supported\":true,\"minimum\":0,\"maximum\":1}}}}]}");
		JsonNode report = app.phaseo.sdk.ParameterSupport.check(model, Map.of("temperature", 1.5));
		assertEquals(false, report.path("ok").asBoolean());
		assertEquals("supported", report.path("parameters").get(0).path("status").asText());
		assertTrue(report.path("parameters").get(0).path("accepted_by").isEmpty());
	}
}
