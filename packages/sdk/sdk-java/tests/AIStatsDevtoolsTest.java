import ai.stats.sdk.AIStats;
import ai.stats.sdk.AIStatsDevtools;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class AIStatsDevtoolsTest {
	@Test
	void capturesResponsesEntriesToDevtoolsDirectory() throws Exception {
		AtomicInteger responseCalls = new AtomicInteger(0);
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/data/models", jsonHandler(new AtomicInteger(0), """
			{"models":[{"model_id":"openai/gpt-5-nano","status":"Available","lifecycle":{"status":"active"}}]}
			"""));
		server.createContext("/responses", jsonHandler(responseCalls, """
			{"id":"resp_1","model":"openai/gpt-5-nano","request_id":"req_java_1","session_id":"session_java_chat_1","upstream_request_id":"upstream_java_chat_1","pricing_lines":[{"provider":"openai","cost_usd":0.0025}],"latency_ms":120,"generation_ms":340,"provider_attempts":[{"provider":"openai","status_code":200,"duration_ms":460}],"usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}
			"""));
		server.start();

		Path devtoolsDir = Files.createTempDirectory("ai-stats-devtools-java-");
		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
			AIStats client = new AIStats(
				"test",
				baseUrl,
				false,
				false,
				null,
				AIStatsDevtools.create(true, devtoolsDir.toString(), false, true)
			);

			Map<String, Object> request = new HashMap<>();
			request.put("model", "openai/gpt-5-nano");
			request.put("input", "hi");
			client.createResponse(request);

			Path generations = devtoolsDir.resolve("generations.jsonl");
			Path metadata = devtoolsDir.resolve("metadata.json");
			assertTrue(Files.exists(generations), "generations.jsonl should exist");
			assertTrue(Files.exists(metadata), "metadata.json should exist");
			String content = Files.readString(generations);
			assertTrue(content.contains("\"type\":\"responses\""));
			assertTrue(content.contains("\"sdk\":\"java\""));
			assertTrue(content.contains("\"request_id\":\"req_java_1\""));
			assertTrue(content.contains("\"session_id\":\"session_java_chat_1\""));
			assertTrue(content.contains("\"upstream_request_id\":\"upstream_java_chat_1\""));
			assertTrue(content.contains("\"pricing_lines\""));
			assertTrue(content.contains("\"provider_attempts\""));
			assertTrue(responseCalls.get() == 1);
		} finally {
			server.stop(0);
			if (Files.exists(devtoolsDir)) {
				Files.walk(devtoolsDir)
					.sorted((left, right) -> right.compareTo(left))
					.forEach(path -> {
						try {
							Files.deleteIfExists(path);
						} catch (IOException ignored) {
						}
					});
			}
		}
	}

	@Test
	void capturesStructuredErrorResponsesToDevtoolsDirectory() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/data/models", jsonHandler(new AtomicInteger(0), """
			{"models":[{"model_id":"openai/gpt-5-nano","status":"Available","lifecycle":{"status":"active"}}]}
			"""));
		server.createContext("/responses", errorJsonHandler("""
			{"error":"rate limited","request_id":"req_java_err_1","provider_attempts":[{"provider":"openrouter","status_code":429,"duration_ms":612}]}
			""", 429));
		server.start();

		Path devtoolsDir = Files.createTempDirectory("ai-stats-devtools-java-");
		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
			AIStats client = new AIStats(
				"test",
				baseUrl,
				false,
				false,
				null,
				AIStatsDevtools.create(true, devtoolsDir.toString(), false, true)
			);

			Map<String, Object> request = new HashMap<>();
			request.put("model", "openai/gpt-5-nano");
			request.put("input", "hi");

			var error = org.junit.jupiter.api.Assertions.assertThrows(
				ai.stats.gen.Client.ApiException.class,
				() -> client.createResponse(request)
			);
			assertEquals(429, error.getStatusCode());

			String content = Files.readString(devtoolsDir.resolve("generations.jsonl"));
			assertTrue(content.contains("\"request_id\":\"req_java_err_1\""));
			assertTrue(content.contains("\"status_code\":429"));
			assertTrue(content.contains("\"provider_attempts\""));
		} finally {
			server.stop(0);
			if (Files.exists(devtoolsDir)) {
				Files.walk(devtoolsDir)
					.sorted((left, right) -> right.compareTo(left))
					.forEach(path -> {
						try {
							Files.deleteIfExists(path);
						} catch (IOException ignored) {
						}
					});
			}
		}
	}

	@Test
	void capturesBatchEntriesToDevtoolsDirectory() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/batches", jsonHandler(new AtomicInteger(0), """
			{"id":"batch_java_1","object":"batch","status":"completed","endpoint":"/v1/responses","provider":"openai","request_id":"req_java_batch_1","session_id":"session_java_batch_1","pricing_lines":[{"dimension":"batch_requests","units":2}],"request_counts":{"total":2,"completed":1,"failed":1},"billing":{"charged":true,"cost_usd":0.0025}}
			"""));
		server.start();

		Path devtoolsDir = Files.createTempDirectory("ai-stats-devtools-java-");
		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
			AIStats client = new AIStats(
				"test",
				baseUrl,
				false,
				false,
				null,
				AIStatsDevtools.create(true, devtoolsDir.toString(), false, true)
			);

			Map<String, Object> request = new HashMap<>();
			request.put("input_file_id", "file_java_1");
			request.put("endpoint", "/v1/responses");
			request.put("completion_window", "24h");
			request.put("session_id", "session_java_batch_1");
			request.put("webhook", Map.of("url", "https://example.com/hooks/batch"));
			client.createBatch(request);

			String content = Files.readString(devtoolsDir.resolve("generations.jsonl")).lines().findFirst().orElseThrow();
			var entry = new ObjectMapper().readTree(content);
			assertEquals("batches.create", entry.get("type").asText());
			assertEquals("session_java_batch_1", entry.get("request").get("session_id").asText());
			assertEquals("https://example.com/hooks/batch", entry.get("request").get("webhook").get("url").asText());
			assertEquals("openai", entry.get("metadata").get("provider").asText());
			assertEquals("session_java_batch_1", entry.get("metadata").get("session_id").asText());
			assertEquals(2, entry.get("metadata").get("request_counts").get("total").asInt());
			assertTrue(entry.get("metadata").get("billing").get("charged").asBoolean());
		} finally {
			server.stop(0);
			if (Files.exists(devtoolsDir)) {
				Files.walk(devtoolsDir)
					.sorted((left, right) -> right.compareTo(left))
					.forEach(path -> {
						try {
							Files.deleteIfExists(path);
						} catch (IOException ignored) {
						}
					});
			}
		}
	}

	@Test
	void capturesGenerationLookupEntriesToDevtoolsDirectory() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/generations", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				assertEquals("id=gen_java_1", exchange.getRequestURI().getRawQuery());
				byte[] bytes = """
					{"id":"gen_java_1","provider":"openai","request_id":"req_java_generation_1","session_id":"session_java_generation_1","status_code":200}
					""".getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.start();

		Path devtoolsDir = Files.createTempDirectory("ai-stats-devtools-java-");
		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
			AIStats client = new AIStats(
				"test",
				baseUrl,
				false,
				false,
				null,
				AIStatsDevtools.create(true, devtoolsDir.toString(), false, true)
			);

			client.getGeneration("gen_java_1");

			String content = Files.readString(devtoolsDir.resolve("generations.jsonl")).lines().findFirst().orElseThrow();
			var entry = new ObjectMapper().readTree(content);
			assertEquals("generations.retrieve", entry.get("type").asText());
			assertEquals("gen_java_1", entry.get("request").get("id").asText());
			assertEquals("req_java_generation_1", entry.get("metadata").get("request_id").asText());
			assertEquals("session_java_generation_1", entry.get("metadata").get("session_id").asText());
			assertEquals("openai", entry.get("metadata").get("provider").asText());
		} finally {
			server.stop(0);
			if (Files.exists(devtoolsDir)) {
				Files.walk(devtoolsDir)
					.sorted((left, right) -> right.compareTo(left))
					.forEach(path -> {
						try {
							Files.deleteIfExists(path);
						} catch (IOException ignored) {
						}
					});
			}
		}
	}

	@Test
	void capturesHealthEntriesToDevtoolsDirectory() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/health", jsonHandler(new AtomicInteger(0), """
			{"status":"ok","timestamp":"2026-05-05T12:00:00.000Z"}
			"""));
		server.start();

		Path devtoolsDir = Files.createTempDirectory("ai-stats-devtools-java-");
		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
			AIStats client = new AIStats(
				"test",
				baseUrl,
				false,
				false,
				null,
				AIStatsDevtools.create(true, devtoolsDir.toString(), false, true)
			);

			JsonNode response = client.healthz();
			assertEquals("ok", response.path("status").asText());

			String content = Files.readString(devtoolsDir.resolve("generations.jsonl")).lines().findFirst().orElseThrow();
			var entry = new ObjectMapper().readTree(content);
			assertEquals("health", entry.get("type").asText());
			assertEquals("ok", entry.get("response").get("status").asText());
		} finally {
			server.stop(0);
			if (Files.exists(devtoolsDir)) {
				Files.walk(devtoolsDir)
					.sorted((left, right) -> right.compareTo(left))
					.forEach(path -> {
						try {
							Files.deleteIfExists(path);
						} catch (IOException ignored) {
						}
					});
			}
		}
	}

	@Test
	void capturesControlPlaneEntriesToDevtoolsDirectory() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/gateway/models", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				assertEquals("limit=2", exchange.getRequestURI().getRawQuery());
				byte[] bytes = """
					{"models":[{"model_id":"openai/gpt-5-mini"}]}
					""".getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/providers", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				assertEquals("limit=2", exchange.getRequestURI().getRawQuery());
				byte[] bytes = """
					{"providers":[{"provider_id":"openai","name":"OpenAI"}]}
					""".getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/credits", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				assertEquals("team_id=team_123", exchange.getRequestURI().getRawQuery());
				byte[] bytes = """
					{"credits":{"balance_usd":42.5}}
					""".getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/activity", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				assertEquals("days=30", exchange.getRequestURI().getRawQuery());
				byte[] bytes = """
					{"ok":true,"total":1,"activity":[{"request_id":"req_java_activity_1"}]}
					""".getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/analytics", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				assertEquals("date=2026-05-01", exchange.getRequestURI().getRawQuery());
				byte[] bytes = """
					{"data":[{"date":"2026-05-01","endpoint_id":"responses","requests":12}]}
					""".getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/endpoints", jsonHandler(new AtomicInteger(0), """
			{"data":[{"id":"responses","path":"/responses"}]}
			"""));
		server.createContext("/organisations", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				String rawQuery = exchange.getRequestURI().getRawQuery();
				assertTrue(rawQuery.contains("limit=2"));
				assertTrue(rawQuery.contains("offset=3"));
				byte[] bytes = """
					{"total":1,"organisations":[{"organisation_id":"org_java_1","name":"Anthropic"}]}
					""".getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/pricing/models", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				assertEquals("provider=openai", exchange.getRequestURI().getRawQuery());
				byte[] bytes = """
					{"models":[{"provider":"openai","model":"openai/gpt-5-mini"}]}
					""".getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/pricing/calculate", jsonHandler(new AtomicInteger(0), """
			{"pricing":{"total_cost_usd":0.00025,"currency":"USD"}}
			"""));
		server.createContext("/keys", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				String rawQuery = exchange.getRequestURI().getRawQuery();
				assertTrue(rawQuery.contains("disabled=true"));
				assertTrue(rawQuery.contains("limit=2"));
				byte[] bytes = """
					{"object":"list","data":[{"id":"key_java_1","status":"active"}]}
					""".getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/key", jsonHandler(new AtomicInteger(0), """
			{"data":{"id":"key_java_1","status":"active"}}
			"""));
		server.createContext("/workspaces", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				assertEquals("GET", exchange.getRequestMethod());
				assertEquals("limit=2", exchange.getRequestURI().getRawQuery());
				byte[] bytes = """
					{"object":"list","data":[{"id":"ws_java_1"}]}
					""".getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.start();

		Path devtoolsDir = Files.createTempDirectory("ai-stats-devtools-java-");
		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
			AIStats client = new AIStats(
				"test",
				baseUrl,
				false,
				false,
				null,
				AIStatsDevtools.create(true, devtoolsDir.toString(), false, true)
			);

			client.listModels(Map.of("limit", "2"));
			client.listProviders(Map.of("limit", "2"));
			client.getCredits(Map.of("team_id", "team_123"));
			client.getActivity(Map.of("days", "30"));
			client.getAnalytics(Map.of("date", "2026-05-01"));
			client.listEndpoints();
			client.listOrganisations(Map.of("limit", "2", "offset", "3"));
			client.listPricingModels(Map.of("provider", "openai"));
			client.calculatePricing(Map.of(
				"provider", "openai",
				"model", "openai/gpt-5-mini",
				"endpoint", "responses"
			));
			client.listApiKeys(Map.of("disabled", "true", "limit", "2"));
			client.getCurrentApiKey();
			client.listWorkspaces(Map.of("limit", "2"));

			var lines = Files.readAllLines(devtoolsDir.resolve("generations.jsonl"));
			assertEquals(12, lines.size());

			var mapper = new ObjectMapper();
			String[] expectedTypes = new String[] {
				"models.list",
				"providers",
				"credits",
				"activity",
				"analytics",
				"endpoints.list",
				"organisations.list",
				"pricing.models",
				"pricing.calculate",
				"provisioning.keys.list",
				"key.current",
				"provisioning.workspaces.list"
			};

			for (int i = 0; i < expectedTypes.length; i++) {
				JsonNode entry = mapper.readTree(lines.get(i));
				assertEquals(expectedTypes[i], entry.get("type").asText());
			}

			JsonNode analyticsEntry = mapper.readTree(lines.get(4));
			assertEquals("responses", analyticsEntry.get("response").get("data").get(0).get("endpoint_id").asText());

			JsonNode pricingEntry = mapper.readTree(lines.get(8));
			assertEquals("USD", pricingEntry.get("response").get("pricing").get("currency").asText());

			JsonNode currentKeyEntry = mapper.readTree(lines.get(10));
			assertEquals("key_java_1", currentKeyEntry.get("response").get("data").get("id").asText());

			JsonNode workspacesEntry = mapper.readTree(lines.get(11));
			assertEquals("ws_java_1", workspacesEntry.get("response").get("data").get(0).get("id").asText());
		} finally {
			server.stop(0);
			if (Files.exists(devtoolsDir)) {
				Files.walk(devtoolsDir)
					.sorted((left, right) -> right.compareTo(left))
					.forEach(path -> {
						try {
							Files.deleteIfExists(path);
						} catch (IOException ignored) {
						}
					});
			}
		}
	}

	@Test
	void capturesVideoLifecycleEntriesToDevtoolsDirectory() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/data/models", jsonHandler(new AtomicInteger(0), """
			{"models":[{"model_id":"google/veo-3","status":"active"}]}
			"""));
		server.createContext("/videos", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes = """
					{"id":"video_java_1","object":"video","status":"queued","provider":"google","model":"google/veo-3","request_id":"req_java_video_1","session_id":"session_java_video_1"}
					""".getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/videos/video_java_1", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes = """
					{"id":"video_java_1","object":"video","status":"completed","provider":"google","model":"google/veo-3","request_id":"req_java_video_2","session_id":"session_java_video_2"}
					""".getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.createContext("/videos/video_java_1/cancel", new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes = """
					{"id":"video_java_1","object":"video","status":"cancelled","provider":"google","model":"google/veo-3","request_id":"req_java_video_3","session_id":"session_java_video_3"}
					""".getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		});
		server.start();

		Path devtoolsDir = Files.createTempDirectory("ai-stats-devtools-java-");
		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
			AIStats client = new AIStats(
				"test",
				baseUrl,
				false,
				false,
				null,
				AIStatsDevtools.create(true, devtoolsDir.toString(), false, true)
			);

			client.createVideo(Map.of("model", "google/veo-3", "prompt", "orbital reveal"));
			client.getVideo("video_java_1");
			client.cancelVideo("video_java_1");

			var lines = Files.readAllLines(devtoolsDir.resolve("generations.jsonl"));
			assertEquals(3, lines.size());

			var createEntry = new ObjectMapper().readTree(lines.get(0));
			assertEquals("video.generations", createEntry.get("type").asText());
			assertEquals("google", createEntry.get("metadata").get("provider").asText());
			assertEquals("req_java_video_1", createEntry.get("metadata").get("request_id").asText());

			var retrieveEntry = new ObjectMapper().readTree(lines.get(1));
			assertEquals("video.retrieve", retrieveEntry.get("type").asText());
			assertEquals("video_java_1", retrieveEntry.get("request").get("video_id").asText());
			assertEquals("session_java_video_2", retrieveEntry.get("metadata").get("session_id").asText());

			var cancelEntry = new ObjectMapper().readTree(lines.get(2));
			assertEquals("video.cancel", cancelEntry.get("type").asText());
			assertEquals("req_java_video_3", cancelEntry.get("metadata").get("request_id").asText());
		} finally {
			server.stop(0);
			if (Files.exists(devtoolsDir)) {
				Files.walk(devtoolsDir)
					.sorted((left, right) -> right.compareTo(left))
					.forEach(path -> {
						try {
							Files.deleteIfExists(path);
						} catch (IOException ignored) {
						}
					});
			}
		}
	}

	private static HttpHandler jsonHandler(AtomicInteger counter, String payload) {
		return new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				counter.incrementAndGet();
				byte[] bytes = payload.getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		};
	}

	private static HttpHandler errorJsonHandler(String payload, int statusCode) {
		return new HttpHandler() {
			@Override
			public void handle(HttpExchange exchange) throws IOException {
				byte[] bytes = payload.getBytes();
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(statusCode, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			}
		};
	}
}
