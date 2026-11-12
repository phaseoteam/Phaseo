import app.phaseo.gen.Client;
import app.phaseo.sdk.Phaseo;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

import static org.junit.jupiter.api.Assertions.*;

@Timeout(10)
public class PhaseoStreamingTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void streamsResponsesBeforeTheServerFinishesAndPreservesSseFrames() throws Exception {
        assertStreaming("/responses", true);
    }

    @Test
    void streamsChatThroughThePublishedRawClient() throws Exception {
        assertStreaming("/chat/completions", false);
    }

    private void assertStreaming(String path, boolean responses) throws Exception {
        CountDownLatch firstLineRead = new CountDownLatch(1);
        AtomicReference<String> authorization = new AtomicReference<>();
        AtomicReference<String> accept = new AtomicReference<>();
        AtomicReference<String> contentType = new AtomicReference<>();
        AtomicReference<String> requestBody = new AtomicReference<>();
        AtomicReference<Throwable> serverFailure = new AtomicReference<>();
        String firstLine = responses ? "event: response.output_text.delta" : ": keep-alive";
        String tail = "data: {\"delta\":\"héllo\"}\r\n\r\ndata: [DONE]\r\n\r\n";
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(path, exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            accept.set(exchange.getRequestHeaders().getFirst("Accept"));
            contentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
            exchange.sendResponseHeaders(200, 0);
            try (var output = exchange.getResponseBody()) {
                output.write((firstLine + "\r\n").getBytes(StandardCharsets.UTF_8));
                output.flush();
                if (!firstLineRead.await(3, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("SDK buffered the stream until completion");
                }
                byte[] bytes = tail.getBytes(StandardCharsets.UTF_8);
                // Split the UTF-8 character across writes to exercise the HTTP line decoder.
                int split = tail.indexOf('é') + 1;
                output.write(bytes, 0, split);
                output.flush();
                output.write(bytes, split, bytes.length - split);
            } catch (Exception error) {
                serverFailure.set(error);
            }
        });
        server.start();
        try {
            Phaseo client = new Phaseo("local-test-key", "http://127.0.0.1:" + server.getAddress().getPort(), false, false, null)
                .setTimeout(Duration.ofSeconds(5));
            Map<String, Object> payload = responses
                ? Map.of("model", "test-model", "input", "Hello")
                : Map.of("model", "test-model", "messages", List.of(Map.of("role", "user", "content", "Hello")), "stream", true);
            try (Stream<String> lines = responses ? client.streamResponse(payload)
                : client.rawClient().requestLines("POST", path, null, null, MAPPER.writeValueAsString(payload))) {
                var iterator = lines.iterator();
                assertEquals(firstLine, iterator.next());
                firstLineRead.countDown();
                List<String> remaining = new ArrayList<>();
                iterator.forEachRemaining(remaining::add);
                assertEquals(List.of("data: {\"delta\":\"héllo\"}", "", "data: [DONE]", ""), remaining);
            }
            assertNull(serverFailure.get());
            assertEquals("Bearer local-test-key", authorization.get());
            assertEquals("text/event-stream", accept.get());
            assertEquals("application/json", contentType.get());
            assertTrue(MAPPER.readTree(requestBody.get()).path("stream").asBoolean());
            assertEquals("test-model", MAPPER.readTree(requestBody.get()).path("model").asText());
            if (responses) assertFalse(payload.containsKey("stream"));
        } finally {
            firstLineRead.countDown();
            server.stop(0);
        }
    }

    @Test
    void streamingHttpErrorsRetainStatusCodeBodyAndRequestId() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            byte[] body = "{\"error\":{\"code\":\"invalid_api_key\",\"message\":\"Invalid key\"}}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("X-Request-Id", "req_stream_error");
            exchange.sendResponseHeaders(401, body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        server.start();
        try {
            Phaseo client = new Phaseo("invalid-test-key", "http://127.0.0.1:" + server.getAddress().getPort(), false, false, null);
            for (String path : List.of("/responses", "/chat/completions")) {
                Client.ApiException error = assertThrows(Client.ApiException.class,
                    () -> client.rawClient().requestLines("POST", path, null, null, "{\"stream\":true}"));
                assertEquals(401, error.getStatusCode());
                assertEquals("invalid_api_key", error.getCode());
                assertEquals("req_stream_error", error.getRequestId());
            }
        } finally { server.stop(0); }
    }
}
