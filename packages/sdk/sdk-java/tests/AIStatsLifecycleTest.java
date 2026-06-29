import ai.stats.sdk.AIStats;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class AIStatsLifecycleTest {
	@Test
	void deprecatedModelBlocksRequest() throws Exception {
		AtomicInteger dataModelsCalls = new AtomicInteger(0);
		AtomicInteger responseCalls = new AtomicInteger(0);
		List<String> warnings = new ArrayList<>();

		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/models", jsonHandler(dataModelsCalls, """
			{"models":[{"model_id":"provider/old-model","lifecycle":{"status":"deprecated","retirement_date":"2099-01-01T00:00:00Z","replacement_model_id":"provider/new-model"}}]}
			"""));
		server.createContext("/responses", jsonHandler(responseCalls, """
			{"id":"resp_1","model":"provider/old-model"}
			"""));
		server.start();
		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
			AIStats client = new AIStats(
				"test",
				baseUrl,
				true,
				false,
				(level, message, meta) -> {
					if ("warn".equals(level)) {
						warnings.add(message);
					}
				}
			);

			Map<String, Object> request = new HashMap<>();
			request.put("model", "provider/old-model");
			request.put("input", "hello");
			IllegalStateException ex = assertThrows(IllegalStateException.class, () -> client.createResponse(request));

			assertTrue(ex.getMessage().contains("provider/new-model"));
			assertEquals(0, warnings.size());
			assertEquals(1, dataModelsCalls.get());
			assertEquals(0, responseCalls.get());
		} finally {
			server.stop(0);
		}
	}

	@Test
	void retiredModelBlocksRequestWithoutWarningsAsErrors() throws Exception {
		AtomicInteger responseCalls = new AtomicInteger(0);

		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/models", jsonHandler(new AtomicInteger(0), """
			{"models":[{"model_id":"provider/retired-model","lifecycle":{"status":"retired","retirement_date":"2020-01-01T00:00:00Z"}}]}
			"""));
		server.createContext("/responses", jsonHandler(responseCalls, """
			{"id":"resp_1","model":"provider/retired-model"}
			"""));
		server.start();
		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
			AIStats client = new AIStats("test", baseUrl, true, false, null);
			Map<String, Object> request = new HashMap<>();
			request.put("model", "provider/retired-model");
			request.put("input", "hello");

			IllegalStateException ex = assertThrows(IllegalStateException.class, () -> client.createResponse(request));
			assertTrue(ex.getMessage().contains("retired"));
			assertEquals(0, responseCalls.get());
		} finally {
			server.stop(0);
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
