import app.phaseo.gen.Client.ApiException;
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
import static org.junit.jupiter.api.Assertions.assertThrows;

public class PhaseoBatchesTest {
	@Test
	void createBatchReturnsPayload() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/batches", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] requestBody = exchange.getRequestBody().readAllBytes();
				String body = new String(requestBody, StandardCharsets.UTF_8);
				assertEquals("POST", exchange.getRequestMethod());
				org.junit.jupiter.api.Assertions.assertTrue(body.contains("\"input_file_id\":\"file_123\""));
				org.junit.jupiter.api.Assertions.assertTrue(body.contains("\"session_id\":\"session_java_batch_1\""));
				byte[] bytes = "{\"id\":\"batch_123\",\"status\":\"validating\",\"provider\":\"openai\",\"request_id\":\"req_java_batch_1\",\"session_id\":\"session_java_batch_1\",\"pricing_lines\":[{\"provider\":\"openai\",\"cost_usd\":0.03}]}".getBytes(StandardCharsets.UTF_8);
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
			var response = client.createBatch(java.util.Map.of(
				"input_file_id", "file_123",
				"endpoint", "/v1/responses",
				"completion_window", "24h",
				"session_id", "session_java_batch_1"
			));
			assertEquals("batch_123", response.path("id").asText());
			assertEquals("validating", response.path("status").asText());
			assertEquals("openai", response.path("provider").asText());
			assertEquals("req_java_batch_1", response.path("request_id").asText());
			assertEquals("session_java_batch_1", response.path("session_id").asText());
			org.junit.jupiter.api.Assertions.assertTrue(response.path("pricing_lines").isArray());
		} finally {
			server.stop(0);
		}
	}

	@Test
	void retrieveBatchReturnsPayload() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/batches/batch_123", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes = "{\"id\":\"batch_123\",\"status\":\"completed\",\"provider\":\"openai\",\"request_id\":\"req_java_batch_2\",\"session_id\":\"session_java_batch_1\",\"request_counts\":{\"total\":4,\"completed\":3,\"failed\":1},\"billing\":{\"charged\":true,\"cost_usd\":0.12}}".getBytes(StandardCharsets.UTF_8);
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
			var response = client.retrieveBatch("batch_123");
			assertEquals("batch_123", response.path("id").asText());
			assertEquals("completed", response.path("status").asText());
			assertEquals("openai", response.path("provider").asText());
			assertEquals("req_java_batch_2", response.path("request_id").asText());
			assertEquals("session_java_batch_1", response.path("session_id").asText());
			org.junit.jupiter.api.Assertions.assertTrue(response.path("request_counts").isObject());
			org.junit.jupiter.api.Assertions.assertTrue(response.path("billing").isObject());
		} finally {
			server.stop(0);
		}
	}

	@Test
	void cancelBatchReturnsPayload() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/batches/batch_123/cancel", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes = "{\"id\":\"batch_123\",\"status\":\"cancelling\"}".getBytes(StandardCharsets.UTF_8);
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
			var response = client.cancelBatch("batch_123");
			assertEquals("batch_123", response.path("id").asText());
			assertEquals("cancelling", response.path("status").asText());
		} finally {
			server.stop(0);
		}
	}

	@Test
	void cancelBatchSurfacesApiErrors() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/batches/batch_missing_123/cancel", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes = "{\"error\":\"not found\"}".getBytes(StandardCharsets.UTF_8);
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(404, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.start();

		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
			Phaseo client = new Phaseo("test", baseUrl, false, false, null);
			ApiException error = assertThrows(ApiException.class, () -> client.cancelBatch("batch_missing_123"));
			assertEquals(404, error.getStatusCode());
		} finally {
			server.stop(0);
		}
	}

	@Test
	void getBatchWebSocketUrlBuildsExpectedUrl() {
		Phaseo client = new Phaseo("test", "https://api.phaseo.ai/v1/", false, false, null);
		String url = client.getBatchWebSocketUrl("batch_123", 1500, false);
		assertEquals(
			"wss://api.phaseo.ai/v1/async/batch/batch_123/ws?interval_ms=1500&close_on_terminal=false",
			url
		);
	}

	@Test
	void getAsyncJobWebSocketUrlBuildsExpectedUrl() {
		Phaseo client = new Phaseo("test", "https://api.phaseo.ai/v1/", false, false, null);
		String url = client.getAsyncJobWebSocketUrl("video", "video 123", 1500, false);
		assertEquals(
			"wss://api.phaseo.ai/v1/async/video/video%20123/ws?interval_ms=1500&close_on_terminal=false",
			url
		);
	}
}
