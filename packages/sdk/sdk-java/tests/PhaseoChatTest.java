import app.phaseo.sdk.Phaseo;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class PhaseoChatTest {
	@Test
	void createChatCompletionPreservesGatewayMetadata() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/models", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes = "{\"models\":[{\"model_id\":\"openai/gpt-5-nano\",\"status\":\"active\"}]}".getBytes(StandardCharsets.UTF_8);
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/chat/completions", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] requestBody = exchange.getRequestBody().readAllBytes();
				String body = new String(requestBody, StandardCharsets.UTF_8);
				assertEquals("POST", exchange.getRequestMethod());
				assertTrue(body.contains("\"model\":\"openai/gpt-5-nano\""));
				byte[] bytes = "{\"id\":\"req_java_chat_1\",\"nativeResponseId\":\"chatcmpl_java_1\",\"object\":\"chat.completion\",\"created\":1723000000,\"model\":\"openai/gpt-5-nano\",\"provider\":\"openai\",\"session_id\":\"session_java_chat_1\",\"upstream_request_id\":\"upstream_java_chat_1\",\"provider_attempts\":[{\"provider\":\"openai\",\"status_code\":200,\"duration_ms\":412}],\"pricing_lines\":[{\"provider\":\"openai\",\"cost_usd\":0.0025}],\"usage\":{\"input_tokens\":2,\"output_tokens\":1,\"total_tokens\":3},\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\",\"content\":\"hi\"},\"finish_reason\":\"stop\"}]}".getBytes(StandardCharsets.UTF_8);
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
			var response = client.createChatCompletion(java.util.Map.of(
				"model", "openai/gpt-5-nano",
				"messages", java.util.List.of(java.util.Map.of("role", "user", "content", "hi"))
			));
			assertEquals("openai", response.path("provider").asText());
			assertEquals("chatcmpl_java_1", response.path("nativeResponseId").asText());
			assertEquals("session_java_chat_1", response.path("session_id").asText());
			assertEquals("upstream_java_chat_1", response.path("upstream_request_id").asText());
			assertTrue(response.path("provider_attempts").isArray());
			assertTrue(response.path("pricing_lines").isArray());
			assertEquals(2, response.path("usage").path("input_tokens").asInt());
			assertEquals(1, response.path("usage").path("output_tokens").asInt());
			assertEquals(3, response.path("usage").path("total_tokens").asInt());
		} finally {
			server.stop(0);
		}
	}
}
