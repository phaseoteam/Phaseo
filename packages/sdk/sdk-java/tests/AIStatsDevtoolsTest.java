import ai.stats.sdk.AIStats;
import ai.stats.sdk.AIStatsDevtools;
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
			{"id":"resp_1","model":"openai/gpt-5-nano","usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}
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
}
