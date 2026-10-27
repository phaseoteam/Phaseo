package app.phaseo.sdk;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * {@code client.realtime}: realtime voice sessions (beta). Uses the JDK's
 * {@link java.net.http.WebSocket}; there is no extra dependency.
 */
public final class Realtime {
	// The relay echoes this protocol back; WebSocket clients need one selected.
	static final String RELAY_PROTOCOL = "statsync-realtime";
	private static final ObjectMapper MAPPER = new ObjectMapper();

	private final Phaseo parent;
	private final String basePath;

	Realtime(Phaseo parent, String basePath) {
		this.parent = parent;
		this.basePath = basePath;
	}

	/** Creates a session for {@code model} and opens the relay socket. */
	public RealtimeSession connect(String model) throws IOException, InterruptedException {
		return connect(Map.of("model", model));
	}

	/**
	 * Creates the session ({@code model}, optional {@code voice}, {@code instructions},
	 * {@code provider}, {@code metadata}), opens the relay socket and waits up to 30 seconds
	 * for {@code relay.connected}.
	 */
	public RealtimeSession connect(Map<String, Object> params) throws IOException, InterruptedException {
		return connect(params, Duration.ofSeconds(30));
	}

	public RealtimeSession connect(Map<String, Object> params, Duration connectTimeout) throws IOException, InterruptedException {
		Object model = params.get("model");
		if (!(model instanceof String) || ((String) model).isBlank()) {
			throw new IllegalArgumentException("model is required");
		}
		Map<String, Object> body = new LinkedHashMap<>(params);
		JsonNode info = parent.request("POST", "/audio/realtime/sessions", null, null, body);
		String secret = info.path("client_secret").asText("");
		String sessionId = info.path("session_id").asText(info.path("id").asText(""));
		String connectUrl = info.path("connect").path("url").asText("");
		if (secret.isEmpty() || sessionId.isEmpty() || connectUrl.isEmpty()) {
			throw new IOException("Realtime session response is missing session_id, client_secret or connect.url");
		}
		RealtimeSession session = new RealtimeSession(sessionId, info, MAPPER);
		CompletableFuture<WebSocket> socket = HttpClient.newHttpClient()
			.newWebSocketBuilder()
			.connectTimeout(connectTimeout)
			.subprotocols(RELAY_PROTOCOL, "rtsec." + secret)
			.buildAsync(URI.create(relayUrl(basePath, connectUrl)), session.listener());
		try {
			session.attach(socket.get(connectTimeout.toMillis(), TimeUnit.MILLISECONDS));
			session.connected().get(connectTimeout.toMillis(), TimeUnit.MILLISECONDS);
		} catch (ExecutionException error) {
			abandon(socket, session);
			Throwable cause = error.getCause() == null ? error : error.getCause();
			if (cause instanceof RuntimeException) {
				throw (RuntimeException) cause;
			}
			throw new IOException("Realtime session " + sessionId + " failed to connect: " + cause.getMessage(), cause);
		} catch (TimeoutException error) {
			abandon(socket, session);
			throw new IOException("Realtime session " + sessionId + " did not connect within " + connectTimeout.toMillis() + " ms", error);
		} catch (InterruptedException error) {
			// The caller never gets the session, so close the socket here or the metered call keeps running.
			abandon(socket, session);
			Thread.currentThread().interrupt();
			throw error;
		}
		return session;
	}

	/** Gives up on a connect: stops the handshake and closes the socket, now or as soon as it opens. */
	private static void abandon(CompletableFuture<WebSocket> socket, RealtimeSession session) {
		session.abandon();
		socket.cancel(true);
	}

	/** Resolves the session's {@code connect.url} against the base URL as ws:// or wss://. */
	public static String relayUrl(String basePath, String connectUrl) {
		URI resolved = URI.create(basePath.replaceAll("/+$", "") + "/").resolve(connectUrl);
		String scheme = resolved.getScheme();
		String wsScheme = "https".equals(scheme) ? "wss" : "http".equals(scheme) ? "ws" : scheme;
		return wsScheme + resolved.toString().substring(scheme.length());
	}

	/** GET /v1/generations?id=realtime:&lt;session_id&gt;, the final bill once settled. */
	public static String finalBillPath(String sessionId) {
		return "/v1/generations?id=" + java.net.URLEncoder.encode("realtime:" + sessionId, java.nio.charset.StandardCharsets.UTF_8);
	}
}
