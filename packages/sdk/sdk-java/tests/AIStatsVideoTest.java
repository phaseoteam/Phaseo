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

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class AIStatsVideoTest {
	@Test
	void retrieveVideoContentReturnsBytes() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/videos/video_123/content", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes = "video-bytes".getBytes(StandardCharsets.UTF_8);
				exchange.getResponseHeaders().add("Content-Type", "video/mp4");
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
			byte[] content = client.retrieveVideoContent("video_123");
			assertArrayEquals("video-bytes".getBytes(StandardCharsets.UTF_8), content);
		} finally {
			server.stop(0);
		}
	}

	@Test
	void getVideoDownloadUrlReturnsPayload() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/videos/video_123/download_url", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("POST", exchange.getRequestMethod());
				byte[] bytes = "{\"download_url\":\"https://cdn.example.test/video.mp4\",\"expires_at\":1723000000}".getBytes(StandardCharsets.UTF_8);
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
			JsonNode response = client.getVideoDownloadUrl("video_123", Map.of("disposition", "attachment"));
			assertEquals("https://cdn.example.test/video.mp4", response.path("download_url").asText());
			assertEquals(1723000000L, response.path("expires_at").asLong());
		} finally {
			server.stop(0);
		}
	}

	@Test
	void videoLifecycleHelpersReturnPayloads() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/gateway/models", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes = "{\"models\":[{\"model_id\":\"google/veo-3\",\"status\":\"active\"}]}".getBytes(StandardCharsets.UTF_8);
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/videos", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				if ("GET".equals(exchange.getRequestMethod())) {
					String query = exchange.getRequestURI().getRawQuery();
					org.junit.jupiter.api.Assertions.assertTrue(query.contains("status=queued%2Ccompleted"));
					org.junit.jupiter.api.Assertions.assertTrue(query.contains("limit=2"));
					byte[] bytes = "{\"object\":\"list\",\"data\":[{\"id\":\"video_123\",\"status\":\"queued\"},{\"id\":\"video_456\",\"status\":\"completed\"}]}".getBytes(StandardCharsets.UTF_8);
					exchange.getResponseHeaders().add("Content-Type", "application/json");
					exchange.sendResponseHeaders(200, bytes.length);
					try (OutputStream os = exchange.getResponseBody()) {
						os.write(bytes);
					}
					return;
				}
				assertEquals("POST", exchange.getRequestMethod());
				byte[] bytes = "{\"id\":\"video_123\",\"object\":\"video\",\"status\":\"queued\",\"provider\":\"google\",\"request_id\":\"req_java_video_1\",\"session_id\":\"session_java_video_1\",\"pricing_lines\":[{\"dimension\":\"video_seconds\",\"units\":8}]}".getBytes(StandardCharsets.UTF_8);
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/videos/video_123", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				if ("GET".equals(exchange.getRequestMethod())) {
					byte[] bytes = "{\"id\":\"video_123\",\"object\":\"video\",\"status\":\"completed\",\"provider\":\"google\",\"request_id\":\"req_java_video_1\",\"session_id\":\"session_java_video_1\",\"pricing_lines\":[{\"dimension\":\"video_seconds\",\"units\":8}]}".getBytes(StandardCharsets.UTF_8);
					exchange.getResponseHeaders().add("Content-Type", "application/json");
					exchange.sendResponseHeaders(200, bytes.length);
					try (OutputStream os = exchange.getResponseBody()) {
						os.write(bytes);
					}
					return;
				}
				if ("DELETE".equals(exchange.getRequestMethod())) {
					byte[] bytes = "{\"id\":\"video_123\",\"object\":\"video\",\"deleted\":true}".getBytes(StandardCharsets.UTF_8);
					exchange.getResponseHeaders().add("Content-Type", "application/json");
					exchange.sendResponseHeaders(200, bytes.length);
					try (OutputStream os = exchange.getResponseBody()) {
						os.write(bytes);
					}
					return;
				}
				exchange.sendResponseHeaders(405, -1);
			}
		});
		server.createContext("/videos/video_123/cancel", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes = "{\"id\":\"video_123\",\"object\":\"video\",\"status\":\"cancelled\"}".getBytes(StandardCharsets.UTF_8);
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/videos/models", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes = "{\"object\":\"list\",\"data\":[{\"id\":\"google/veo-3\"}]}".getBytes(StandardCharsets.UTF_8);
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
			JsonNode created = client.createVideo(Map.of("model", "google/veo-3", "prompt", "orbiting camera shot"));
			assertEquals("queued", created.path("status").asText());
			assertEquals("google", created.path("provider").asText());
			assertEquals("req_java_video_1", created.path("request_id").asText());
			assertEquals("session_java_video_1", created.path("session_id").asText());
			assertEquals(1, created.path("pricing_lines").size());
			JsonNode retrieved = client.getVideo("video_123");
			assertEquals("completed", retrieved.path("status").asText());
			assertEquals("google", retrieved.path("provider").asText());
			assertEquals("req_java_video_1", retrieved.path("request_id").asText());
			assertEquals("session_java_video_1", retrieved.path("session_id").asText());
			JsonNode cancelled = client.cancelVideo("video_123");
			assertEquals("cancelled", cancelled.path("status").asText());
			JsonNode deleted = client.deleteVideo("video_123");
			assertEquals(true, deleted.path("deleted").asBoolean());
			JsonNode models = client.listVideoModels();
			assertEquals("google/veo-3", models.path("data").get(0).path("id").asText());
			JsonNode list = client.listVideos(Map.of("status", "queued,completed", "limit", "2"));
			assertEquals(2, list.path("data").size());
			assertEquals("video_456", list.path("data").get(1).path("id").asText());
		} finally {
			server.stop(0);
		}
	}

	@Test
	void getVideoWebSocketUrlBuildsExpectedUrl() {
		AIStats client = new AIStats("test", "http://localhost:8787/v1", false, false, null);
		String url = client.getVideoWebSocketUrl("video_123", 900, null);
		assertEquals("ws://localhost:8787/v1/async/video/video_123/ws?interval_ms=900", url);
	}
}
