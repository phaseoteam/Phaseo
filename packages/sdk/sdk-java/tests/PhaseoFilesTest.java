import app.phaseo.gen.Client.ApiException;
import app.phaseo.sdk.Phaseo;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class PhaseoFilesTest {
	@Test
	void uploadFileReturnsPayload(@TempDir Path dir) throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		final String[] requestBody = new String[1];
		final String[] contentType = new String[1];
		server.createContext("/batches/files", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] requestBytes = exchange.getRequestBody().readAllBytes();
				requestBody[0] = new String(requestBytes, StandardCharsets.UTF_8);
				contentType[0] = exchange.getRequestHeaders().getFirst("Content-Type");

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
			Phaseo client = new Phaseo("test", baseUrl, false, false, null);
			var response = client.uploadFile(Map.of(
				"purpose", "batch",
				"file", "{\"test\":true}\n".getBytes(StandardCharsets.UTF_8),
				"filename", "input.jsonl"
			));
			assertEquals("file_123", response.get("id").asText());
			assertEquals("batch", response.get("purpose").asText());
			org.junit.jupiter.api.Assertions.assertTrue(contentType[0].startsWith("multipart/form-data; boundary="), contentType[0]);
			org.junit.jupiter.api.Assertions.assertTrue(requestBody[0].contains("name=\"purpose\"\r\n\r\nbatch\r\n"));
			org.junit.jupiter.api.Assertions.assertTrue(requestBody[0].contains("name=\"file\"; filename=\"input.jsonl\"\r\nContent-Type: application/octet-stream"));
			org.junit.jupiter.api.Assertions.assertTrue(requestBody[0].contains("{\"test\":true}\n"));
			org.junit.jupiter.api.Assertions.assertFalse(requestBody[0].contains("name=\"filename\""));

			Path onDisk = dir.resolve("requests.jsonl");
			Files.write(onDisk, "{\"a\":1}\n".getBytes(StandardCharsets.UTF_8));
			client.uploadFile(onDisk, "batch");
			org.junit.jupiter.api.Assertions.assertTrue(requestBody[0].contains("name=\"file\"; filename=\"requests.jsonl\""));
			org.junit.jupiter.api.Assertions.assertTrue(requestBody[0].contains("{\"a\":1}\n"));

			client.uploadFile(Map.of(
				"purpose", "batch",
				"file", new ByteArrayInputStream("{\"b\":2}\n".getBytes(StandardCharsets.UTF_8)),
				"filename", "stream.jsonl",
				"content_type", "application/jsonl"
			));
			org.junit.jupiter.api.Assertions.assertTrue(requestBody[0].contains("name=\"file\"; filename=\"stream.jsonl\"\r\nContent-Type: application/jsonl"));
			org.junit.jupiter.api.Assertions.assertFalse(requestBody[0].contains("name=\"content_type\""));
		} finally {
			server.stop(0);
		}
	}

	@Test
	void uploadFileRejectsStringsAndUnnamedBytes() {
		Phaseo client = new Phaseo("test", "http://127.0.0.1:9", false, false, null);
		IllegalArgumentException stringError = assertThrows(IllegalArgumentException.class, () -> client.uploadFile(Map.of(
			"purpose", "batch",
			"file", "input.jsonl",
			"filename", "input.jsonl"
		)));
		org.junit.jupiter.api.Assertions.assertTrue(stringError.getMessage().contains("Path.of"), stringError.getMessage());
		IllegalArgumentException nameError = assertThrows(IllegalArgumentException.class, () -> client.uploadFile(Map.of(
			"purpose", "batch",
			"file", new byte[] { 1 }
		)));
		org.junit.jupiter.api.Assertions.assertTrue(nameError.getMessage().contains("filename"), nameError.getMessage());
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
			Phaseo client = new Phaseo("test", baseUrl, false, false, null);
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
			Phaseo client = new Phaseo("test", baseUrl, false, false, null);
			ApiException error = assertThrows(ApiException.class, () -> client.retrieveFileContent("file_missing_123"));
			assertEquals(404, error.getStatusCode());
		} finally {
			server.stop(0);
		}
	}
}
