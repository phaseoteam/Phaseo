import ai.stats.gen.Client.ApiException;
import ai.stats.sdk.AIStats;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class AIStatsFilesTest {
	@Test
	void uploadFileReturnsPayload() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		final String[] requestBody = new String[1];
		server.createContext("/files", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] requestBytes = exchange.getRequestBody().readAllBytes();
				requestBody[0] = new String(requestBytes, StandardCharsets.UTF_8);

				byte[] bytes = "{\"id\":\"file_123\",\"purpose\":\"batch\",\"bytes\":17}".getBytes(StandardCharsets.UTF_8);
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
			var response = client.uploadFile(Map.of(
				"purpose", "batch",
				"file", "data:application/json;base64,eyJ0ZXN0Ijp0cnVlfQ=="
			));
			assertEquals("file_123", response.get("id").asText());
			assertEquals("batch", response.get("purpose").asText());
			assertEquals('{', requestBody[0].charAt(0));
			assertEquals('}', requestBody[0].charAt(requestBody[0].length() - 1));
			org.junit.jupiter.api.Assertions.assertTrue(requestBody[0].contains("\"purpose\":\"batch\""));
			org.junit.jupiter.api.Assertions.assertTrue(
				requestBody[0].contains("\"file\":\"data:application/json;base64,eyJ0ZXN0Ijp0cnVlfQ==\"")
			);
		} finally {
			server.stop(0);
		}
	}

	@Test
	void retrieveFileContentReturnsBytes() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/files/file_123/content", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes = "{\"ok\":true}\n".getBytes(StandardCharsets.UTF_8);
				exchange.getResponseHeaders().add("Content-Type", "application/jsonl");
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
			byte[] content = client.retrieveFileContent("file_123");
			assertArrayEquals("{\"ok\":true}\n".getBytes(StandardCharsets.UTF_8), content);
		} finally {
			server.stop(0);
		}
	}

	@Test
	void retrieveFileContentSurfacesApiErrors() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/files/file_missing_123/content", new HttpHandler() {
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
			AIStats client = new AIStats("test", baseUrl, false, false, null);
			ApiException error = assertThrows(ApiException.class, () -> client.retrieveFileContent("file_missing_123"));
			assertEquals(404, error.getStatusCode());
		} finally {
			server.stop(0);
		}
	}
}
