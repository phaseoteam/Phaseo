import app.phaseo.sdk.Phaseo;
import app.phaseo.sdk.Realtime;
import app.phaseo.sdk.RealtimeSession;
import app.phaseo.sdk.RealtimeSessionClosedException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class PhaseoRealtimeTest {
	private static final ObjectMapper MAPPER = new ObjectMapper();
	private static final String ENDED = "{\"type\":\"session.ended\",\"session_id\":\"rt_test\",\"reason\":\"client_requested\","
		+ "\"initiated_by\":\"client\",\"duration_seconds\":12.5,\"usage\":{\"output_audio_tokens\":200},"
		+ "\"cost\":{\"total_usd\":0.01,\"total_nanos\":10000000,\"estimated\":false,\"estimate_basis\":null,"
		+ "\"debt_nanos\":0,\"uncollected_nanos\":0,\"currency\":\"USD\"},\"billing_status\":\"settled\"}";

	interface Behaviour {
		void run(RelayConnection relay) throws Exception;
	}

	/** Minimal RFC 6455 server side: enough to play the relay for one connection. */
	static final class RelayConnection {
		final Socket socket;
		final InputStream in;
		final OutputStream out;
		final List<JsonNode> received = new CopyOnWriteArrayList<>();
		String protocols;
		String path;

		RelayConnection(Socket socket) throws IOException {
			this.socket = socket;
			this.in = socket.getInputStream();
			this.out = socket.getOutputStream();
		}

		void handshake() throws Exception {
			ByteArrayOutputStream head = new ByteArrayOutputStream();
			while (!head.toString(StandardCharsets.ISO_8859_1).endsWith("\r\n\r\n")) {
				head.write(in.read());
			}
			String key = null;
			String[] lines = head.toString(StandardCharsets.ISO_8859_1).split("\r\n");
			path = lines[0].split(" ")[1];
			for (String line : lines) {
				int colon = line.indexOf(':');
				if (colon < 0) continue;
				String name = line.substring(0, colon).trim().toLowerCase();
				String value = line.substring(colon + 1).trim();
				if (name.equals("sec-websocket-key")) key = value;
				if (name.equals("sec-websocket-protocol")) protocols = value;
			}
			String accept = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-1")
				.digest((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(StandardCharsets.ISO_8859_1)));
			out.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
				+ "Sec-WebSocket-Accept: " + accept + "\r\nSec-WebSocket-Protocol: statsync-realtime\r\n\r\n")
				.getBytes(StandardCharsets.ISO_8859_1));
			out.flush();
		}

		void sendText(String text) throws IOException {
			byte[] payload = text.getBytes(StandardCharsets.UTF_8);
			writeFrame(0x81, payload);
		}

		void close(int code, String reason) throws IOException {
			byte[] reasonBytes = reason.getBytes(StandardCharsets.UTF_8);
			byte[] payload = new byte[2 + reasonBytes.length];
			payload[0] = (byte) (code >> 8);
			payload[1] = (byte) code;
			System.arraycopy(reasonBytes, 0, payload, 2, reasonBytes.length);
			writeFrame(0x88, payload);
		}

		private void writeFrame(int opcode, byte[] payload) throws IOException {
			out.write(opcode);
			if (payload.length < 126) {
				out.write(payload.length);
			} else {
				out.write(126);
				out.write(payload.length >> 8);
				out.write(payload.length & 0xff);
			}
			out.write(payload);
			out.flush();
		}

		/** Reads client text frames until one has the given type. Returns false on close. */
		boolean receiveUntil(String type) throws IOException {
			DataInputStream data = new DataInputStream(in);
			while (true) {
				int first = data.read();
				if (first < 0) return false;
				int second = data.read();
				long length = second & 0x7f;
				if (length == 126) length = data.readUnsignedShort();
				else if (length == 127) length = data.readLong();
				byte[] mask = new byte[4];
				data.readFully(mask);
				byte[] payload = new byte[(int) length];
				data.readFully(payload);
				for (int i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
				int opcode = first & 0x0f;
				if (opcode == 0x8) return false;
				if (opcode != 0x1) continue;
				JsonNode message = MAPPER.readTree(new String(payload, StandardCharsets.UTF_8));
				received.add(message);
				if (type.equals(message.path("type").asText())) return true;
			}
		}
	}

	static final class FakeRelay implements AutoCloseable {
		final HttpServer api;
		final ServerSocket relaySocket;
		final List<RelayConnection> connections = new ArrayList<>();
		final List<JsonNode> created = new CopyOnWriteArrayList<>();
		final Thread thread;

		FakeRelay(Behaviour behaviour) throws IOException {
			this(behaviour, true);
		}

		FakeRelay(Behaviour behaviour, boolean sendConnected) throws IOException {
			relaySocket = new ServerSocket(0);
			api = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
			int relayPort = relaySocket.getLocalPort();
			api.createContext("/v1/audio/realtime/sessions", exchange -> {
				created.add(MAPPER.readTree(exchange.getRequestBody()));
				byte[] bytes = ("{\"id\":\"rt_test\",\"session_id\":\"rt_test\",\"client_secret\":\"rtsec_secret\","
					+ "\"connect\":{\"transport\":\"websocket\",\"url\":\"ws://127.0.0.1:" + relayPort + "/v1/realtime/sessions/rt_test/relay\"},"
					+ "\"max_duration_seconds\":3600}").getBytes(StandardCharsets.UTF_8);
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(201, bytes.length);
				try (OutputStream os = exchange.getResponseBody()) {
					os.write(bytes);
				}
			});
			api.start();
			thread = new Thread(() -> {
				try (Socket socket = relaySocket.accept()) {
					RelayConnection relay = new RelayConnection(socket);
					synchronized (connections) {
						connections.add(relay);
					}
					relay.handshake();
					if (sendConnected) {
						relay.sendText("{\"type\":\"relay.connected\",\"session_id\":\"rt_test\"}");
					}
					behaviour.run(relay);
					Thread.sleep(100);
				} catch (Exception ignored) {
					// The test asserts on what the client saw.
				}
			});
			thread.start();
		}

		String baseUrl() {
			return "http://127.0.0.1:" + api.getAddress().getPort() + "/v1";
		}

		RelayConnection relay() {
			synchronized (connections) {
				return connections.get(0);
			}
		}

		@Override
		public void close() throws Exception {
			api.stop(0);
			relaySocket.close();
			thread.join(2000);
		}
	}

	@Test
	void connectStreamsEventsAndEndReturnsTheBill() throws Exception {
		try (FakeRelay relay = new FakeRelay(connection -> {
			connection.receiveUntil("client.audio");
			connection.sendText("{\"type\":\"response.output_audio.delta\",\"delta\":\"AAA=\"}");
			connection.sendText("{\"type\":\"session.warning\",\"code\":\"max_duration_approaching\",\"seconds_remaining\":120}");
			connection.receiveUntil("session.end");
			connection.sendText(ENDED);
			connection.close(1000, "");
		})) {
			Phaseo client = new Phaseo("sk_test_123", relay.baseUrl(), false, false, null);
			RealtimeSession session = client.realtime.connect(Map.of("model", "openai/gpt-realtime-2", "voice", "marin"));
			assertEquals("rt_test", session.id());
			assertFalse(session.info().has("client_secret"));
			assertEquals("marin", relay.created.get(0).path("voice").asText());
			assertEquals("statsync-realtime,rtsec.rtsec_secret", relay.relay().protocols.replace(" ", ""));
			assertEquals("/v1/realtime/sessions/rt_test/relay", relay.relay().path);

			List<JsonNode> warnings = new CopyOnWriteArrayList<>();
			session.onWarning(warnings::add);
			Iterable<JsonNode> events = session.events();
			session.sendAudio(new byte[] {0, 1, 2, (byte) 255});
			List<String> types = new ArrayList<>();
			for (JsonNode event : events) {
				types.add(event.path("type").asText());
				if (types.size() == 2) break;
			}
			assertEquals(List.of("response.output_audio.delta", "session.warning"), types);
			assertEquals(120, warnings.get(0).path("seconds_remaining").asInt());

			JsonNode ended = session.end("caller hung up", false, Duration.ofSeconds(5));
			assertEquals("client_requested", ended.path("reason").asText());
			assertEquals(0.01, ended.path("cost").path("total_usd").asDouble());
			List<JsonNode> received = relay.relay().received;
			assertEquals("AAEC/w==", received.get(0).path("audio").asText());
			JsonNode end = received.get(received.size() - 1);
			assertEquals("session.end", end.path("type").asText());
			assertEquals("caller hung up", end.path("reason").asText());
			assertFalse(end.path("cancel_response").asBoolean(true));
		}
	}

	@Test
	void endThrowsWithFinalBillWhenSocketClosesWithoutSessionEnded() throws Exception {
		try (FakeRelay relay = new FakeRelay(connection -> {
			connection.receiveUntil("session.end");
			connection.close(1011, "realtime_client_socket_error");
		})) {
			Phaseo client = new Phaseo("sk_test_123", relay.baseUrl(), false, false, null);
			RealtimeSession session = client.realtime.connect("openai/gpt-realtime-2");
			RealtimeSessionClosedException error = assertThrows(RealtimeSessionClosedException.class, session::end);
			assertEquals(1011, error.closeCode());
			assertEquals("/v1/generations?id=realtime%3Art_test", error.finalBillPath());
			assertTrue(error.getMessage().contains("GET /v1/generations?id=realtime%3Art_test"));
		}
	}

	@Test
	void endTimesOut() throws Exception {
		try (FakeRelay relay = new FakeRelay(connection -> connection.receiveUntil("never"))) {
			Phaseo client = new Phaseo("sk_test_123", relay.baseUrl(), false, false, null);
			RealtimeSession session = client.realtime.connect("openai/gpt-realtime-2");
			RealtimeSessionClosedException error = assertThrows(RealtimeSessionClosedException.class,
				() -> session.end(null, null, Duration.ofMillis(100)));
			assertTrue(error.getMessage().contains("timed out after 100 ms"));
		}
	}

	@Test
	void interruptingConnectBeforeRelayConnectedClosesTheSocket() throws Exception {
		java.util.concurrent.CountDownLatch opened = new java.util.concurrent.CountDownLatch(1);
		java.util.concurrent.CompletableFuture<Boolean> clientClosed = new java.util.concurrent.CompletableFuture<>();
		try (FakeRelay relay = new FakeRelay(connection -> {
			opened.countDown();
			clientClosed.complete(!connection.receiveUntil("never"));
		}, false)) {
			Phaseo client = new Phaseo("sk_test_123", relay.baseUrl(), false, false, null);
			java.util.concurrent.CompletableFuture<Throwable> outcome = new java.util.concurrent.CompletableFuture<>();
			Thread caller = new Thread(() -> {
				try {
					client.realtime.connect(Map.of("model", "openai/gpt-realtime-2"), Duration.ofSeconds(30));
					outcome.complete(null);
				} catch (Throwable error) {
					outcome.complete(Thread.currentThread().isInterrupted() ? error : new AssertionError("interrupt status lost", error));
				}
			});
			caller.start();
			assertTrue(opened.await(5, java.util.concurrent.TimeUnit.SECONDS));
			Thread.sleep(100);
			caller.interrupt();
			Throwable error = outcome.get(5, java.util.concurrent.TimeUnit.SECONDS);
			assertTrue(error instanceof InterruptedException, String.valueOf(error));
			assertTrue(clientClosed.get(5, java.util.concurrent.TimeUnit.SECONDS));
		}
	}

	@Test
	void relayUrlResolvesRelativeConnectUrls() {
		assertEquals("wss://api.phaseo.app/v1/realtime/sessions/rt_x/relay",
			Realtime.relayUrl("https://api.phaseo.app/v1", "/v1/realtime/sessions/rt_x/relay"));
		assertEquals("ws://localhost:8787/v1/realtime/sessions/rt_x/relay",
			Realtime.relayUrl("http://localhost:8787/v1/", "/v1/realtime/sessions/rt_x/relay"));
	}
}
