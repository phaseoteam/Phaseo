package app.phaseo.sdk;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Consumer;

/**
 * A connected realtime voice call. Provider events arrive unchanged as {@link JsonNode}s.
 */
public final class RealtimeSession {
	private static final JsonNode END_OF_STREAM = com.fasterxml.jackson.databind.node.NullNode.getInstance();

	private final String id;
	private final JsonNode info;
	private final ObjectMapper mapper;
	private final Map<String, List<Consumer<JsonNode>>> listeners = new ConcurrentHashMap<>();
	private final List<LinkedBlockingQueue<JsonNode>> queues = new CopyOnWriteArrayList<>();
	private final CompletableFuture<JsonNode> ended = new CompletableFuture<>();
	private final CompletableFuture<Void> connected = new CompletableFuture<>();
	private final Object sendLock = new Object();
	private volatile WebSocket socket;
	private volatile boolean abandoned;

	RealtimeSession(String id, JsonNode info, ObjectMapper mapper) {
		this.id = id;
		ObjectNode copy = info.deepCopy();
		copy.remove("client_secret");
		copy.remove("clientSecret");
		this.info = copy;
		this.mapper = mapper;
		connected.exceptionally(error -> null);
	}

	/** The realtime session ID. */
	public String id() {
		return id;
	}

	/** The create-session response, without {@code client_secret}. */
	public JsonNode info() {
		return info;
	}

	/** Sends PCM16 microphone audio (24 kHz for OpenAI and xAI, 16 kHz for Google) as {@code client.audio}. */
	public void sendAudio(byte[] pcm16) {
		Map<String, Object> event = new LinkedHashMap<>();
		event.put("type", "client.audio");
		event.put("audio", Base64.getEncoder().encodeToString(pcm16));
		send(event);
	}

	/** Sends any event as JSON, for provider-specific messages. */
	public void send(Object event) {
		if (ended.isDone() || socket == null) {
			throw new IllegalStateException("Realtime session " + id + " is not open");
		}
		String text;
		try {
			text = mapper.writeValueAsString(event);
		} catch (JsonProcessingException error) {
			throw new IllegalArgumentException("event is not JSON-serializable", error);
		}
		synchronized (sendLock) {
			socket.sendText(text, true).join();
		}
	}

	/** Subscribes to one event type, or every event with {@code "*"}. Returns an unsubscribe action. */
	public Runnable on(String type, Consumer<JsonNode> listener) {
		listeners.computeIfAbsent(type, key -> new CopyOnWriteArrayList<>()).add(listener);
		return () -> listeners.getOrDefault(type, List.of()).remove(listener);
	}

	public Runnable onWarning(Consumer<JsonNode> listener) {
		return on("session.warning", listener);
	}

	public Runnable onEnded(Consumer<JsonNode> listener) {
		return on("session.ended", listener);
	}

	/** Every event from now until the socket closes. The iterator blocks while waiting. */
	public Iterable<JsonNode> events() {
		LinkedBlockingQueue<JsonNode> queue = new LinkedBlockingQueue<>();
		queues.add(queue);
		if (ended.isDone()) {
			queue.add(END_OF_STREAM);
		}
		return () -> new Iterator<>() {
			private JsonNode next;

			@Override
			public boolean hasNext() {
				if (next == null) {
					try {
						next = queue.take();
					} catch (InterruptedException error) {
						Thread.currentThread().interrupt();
						next = END_OF_STREAM;
					}
				}
				if (next == END_OF_STREAM) {
					queues.remove(queue);
					return false;
				}
				return true;
			}

			@Override
			public JsonNode next() {
				if (!hasNext()) {
					throw new NoSuchElementException();
				}
				JsonNode value = next;
				next = null;
				return value;
			}
		};
	}

	/**
	 * Completes with {@code session.ended} however the call ends; completes exceptionally with
	 * {@link RealtimeSessionClosedException} if the socket closes without it.
	 */
	public CompletableFuture<JsonNode> ended() {
		return ended;
	}

	/** Sends {@code session.end} and returns {@code session.ended} (the final bill). Waits up to 60 seconds. */
	public JsonNode end() throws InterruptedException {
		return end(null, null, Duration.ofSeconds(60));
	}

	/**
	 * Sends {@code session.end} and returns {@code session.ended}: reason, initiated_by, duration_seconds,
	 * usage, cost, billing_status and, unless settled, final_bill.
	 *
	 * @throws RealtimeSessionClosedException if the socket closes, or the timeout passes, without it
	 */
	public JsonNode end(String reason, Boolean cancelResponse, Duration timeout) throws InterruptedException {
		if (!ended.isDone()) {
			Map<String, Object> message = new LinkedHashMap<>();
			message.put("type", "session.end");
			if (reason != null) {
				message.put("reason", reason);
			}
			if (cancelResponse != null) {
				message.put("cancel_response", cancelResponse);
			}
			try {
				send(message);
			} catch (RuntimeException ignored) {
				// The socket is closing; the listener reports how it ended.
			}
		}
		try {
			return ended.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
		} catch (TimeoutException error) {
			fail(new RealtimeSessionClosedException(id, -1, "", "timed out after " + timeout.toMillis() + " ms"));
			close();
		} catch (ExecutionException error) {
			// Rethrown below.
		}
		try {
			return ended.get();
		} catch (ExecutionException error) {
			throw (RealtimeSessionClosedException) error.getCause();
		}
	}

	/** Closes the socket without waiting for the bill. The call is still billed; prefer {@link #end()}. */
	public void close() {
		WebSocket current = socket;
		if (current != null && !current.isOutputClosed()) {
			try {
				current.sendClose(1000, "client_closed");
			} catch (RuntimeException ignored) {
				// Already closing.
			}
		}
	}

	CompletableFuture<Void> connected() {
		return connected;
	}

	void attach(WebSocket socket) {
		this.socket = socket;
	}

	/** connect() gave up: close the socket now, or as soon as it opens if the handshake is still running. */
	void abandon() {
		abandoned = true;
		close();
	}

	WebSocket.Listener listener() {
		return new WebSocket.Listener() {
			private final StringBuilder buffer = new StringBuilder();

			@Override
			public void onOpen(WebSocket webSocket) {
				socket = webSocket;
				if (abandoned) {
					close();
				}
				webSocket.request(1);
			}

			@Override
			public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
				buffer.append(data);
				if (last) {
					String text = buffer.toString();
					buffer.setLength(0);
					dispatch(text);
				}
				webSocket.request(1);
				return null;
			}

			@Override
			public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
				fail(new RealtimeSessionClosedException(id, statusCode, reason == null ? "" : reason, null));
				return null;
			}

			@Override
			public void onError(WebSocket webSocket, Throwable error) {
				fail(new RealtimeSessionClosedException(id, -1, String.valueOf(error.getMessage()), null));
			}
		};
	}

	private void dispatch(String text) {
		JsonNode event;
		try {
			event = mapper.readTree(text);
		} catch (JsonProcessingException error) {
			return;
		}
		if (event == null || !event.path("type").isTextual()) {
			return;
		}
		String type = event.path("type").asText();
		List<Consumer<JsonNode>> targets = new ArrayList<>(listeners.getOrDefault(type, List.of()));
		targets.addAll(listeners.getOrDefault("*", List.of()));
		for (Consumer<JsonNode> listener : targets) {
			try {
				listener.accept(event);
			} catch (RuntimeException ignored) {
				// Listener errors must not break the session.
			}
		}
		for (LinkedBlockingQueue<JsonNode> queue : queues) {
			queue.add(event);
		}
		if ("relay.connected".equals(type)) {
			connected.complete(null);
		} else if ("session.ended".equals(type) && ended.complete(event)) {
			finishQueues();
			connected.completeExceptionally(new IllegalStateException(
				"Realtime session " + id + " ended before connecting: " + event.path("reason").asText()));
		}
	}

	private void fail(RealtimeSessionClosedException error) {
		if (ended.completeExceptionally(error)) {
			finishQueues();
		}
		connected.completeExceptionally(error);
	}

	private void finishQueues() {
		for (LinkedBlockingQueue<JsonNode> queue : queues) {
			queue.add(END_OF_STREAM);
		}
	}
}
