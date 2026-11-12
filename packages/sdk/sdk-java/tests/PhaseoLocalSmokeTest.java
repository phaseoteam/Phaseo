import app.phaseo.gen.Client;
import app.phaseo.sdk.Phaseo;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

import static org.junit.jupiter.api.Assertions.*;

public class PhaseoLocalSmokeTest {
    @Test
    @Timeout(10)
    void sendsDocumentedJsonRequestsAuthenticatesAndRetriesOnlyReads() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        AtomicInteger modelReads = new AtomicInteger();
        AtomicInteger lifecycleReads = new AtomicInteger();
        AtomicReference<String> requestFailure = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            if (!"Bearer local-test-key".equals(exchange.getRequestHeaders().getFirst("Authorization"))) {
                requestFailure.set("Missing bearer authentication");
            }
            int status = 200;
            String body;
            if (path.equals("/v1/models")) {
                String query = exchange.getRequestURI().getQuery();
                if (query.contains("limit=2")) {
                    if (modelReads.incrementAndGet() == 1) {
                        status = 429;
                        exchange.getResponseHeaders().set("Retry-After", "0");
                    }
                } else {
                    lifecycleReads.incrementAndGet();
                    if (!query.contains("model_id=test-model") || !query.contains("limit=1")) {
                        requestFailure.set("Unexpected lifecycle model filter");
                    }
                }
                body = "{\"models\":[{\"model_id\":\"test-model\",\"status\":\"active\"}]}";
            } else {
                JsonNode request = mapper.readTree(exchange.getRequestBody());
                if (!request.isObject() || !request.path("model").asText().equals("test-model")) {
                    requestFailure.set("Request must be a JSON object with a model");
                }
                switch (path) {
                    case "/v1/responses":
                        if (!request.path("input").asText().equals("Hello")) requestFailure.set("Missing input");
                        body = "{\"id\":\"resp_local\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"Hello\"}]}]}";
                        break;
                    case "/v1/chat/completions":
                        if (!request.path("messages").get(0).path("content").asText().equals("Hello")) requestFailure.set("Missing messages");
                        body = "{\"id\":\"chat_local\",\"choices\":[{\"message\":{\"content\":\"Hello\"}}]}";
                        break;
                    case "/v1/embeddings":
                        body = "{\"data\":[{\"embedding\":[0.25,0.75]}]}";
                        break;
                    default:
                        status = 401;
                        body = "{\"error\":{\"code\":\"invalid_api_key\",\"message\":\"Invalid key\"}}";
                }
            }
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.getResponseHeaders().set("X-Request-Id", "req_local_smoke");
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            try (var output = exchange.getResponseBody()) { output.write(bytes); }
        });
        server.start();
        try {
            Phaseo client = new Phaseo("local-test-key", "http://127.0.0.1:" + server.getAddress().getPort() + "/v1", false, false, null)
                .setTimeout(Duration.ofSeconds(3)).setMaxRetries(1);
            // JsonNode matches the corrected endpoint-page samples; Map matches the quickstart.
            assertEquals("resp_local", client.createResponse(mapper.readTree("{\"model\":\"test-model\",\"input\":\"Hello\"}")).path("id").asText());
            assertEquals("chat_local", client.createChatCompletion(Map.of("model", "test-model", "messages", List.of(Map.of("role", "user", "content", "Hello")))).path("id").asText());
            assertEquals(0.25, client.createEmbedding(Map.of("model", "test-model", "input", "Hello")).path("data").get(0).path("embedding").get(0).asDouble());
            assertEquals("test-model", client.listModels(Map.of("limit", "2")).path("models").get(0).path("model_id").asText());
            assertEquals(2, modelReads.get());
            assertEquals(1, lifecycleReads.get());
            Client.ApiException error = assertThrows(Client.ApiException.class,
                () -> client.request("POST", "/invalid", null, null, Map.of("model", "test-model")));
            assertEquals(401, error.getStatusCode());
            assertEquals("invalid_api_key", error.getCode());
            assertEquals("req_local_smoke", error.getRequestId());
            assertNull(requestFailure.get());
        } finally { server.stop(0); }
    }
}
