import app.phaseo.sdk.Phaseo;
import app.phaseo.sdk.PhaseoFile;
import com.fasterxml.jackson.databind.JsonNode;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Sends audio and batch uploads through a real local HTTP server and checks the wire format. */
public class PhaseoAudioMultipartTest {
	static final class Captured {
		String method;
		String path;
		String query;
		String contentType;
		byte[] body;
	}

	static final class Part {
		String name;
		String filename;
		String contentType;
		byte[] value;
	}

	interface Call {
		JsonNode run(Phaseo client) throws Exception;
	}

	private static Captured capture(String responseJson, Call call) throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		AtomicReference<Captured> captured = new AtomicReference<>();
		server.createContext("/", exchange -> {
			Captured c = new Captured();
			c.method = exchange.getRequestMethod();
			c.path = exchange.getRequestURI().getRawPath();
			c.query = exchange.getRequestURI().getRawQuery();
			c.contentType = exchange.getRequestHeaders().getFirst("Content-Type");
			c.body = exchange.getRequestBody().readAllBytes();
			captured.set(c);
			byte[] bytes = responseJson.getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().add("Content-Type", "application/json");
			exchange.sendResponseHeaders(200, bytes.length);
			try (OutputStream os = exchange.getResponseBody()) {
				os.write(bytes);
			}
		});
		server.start();
		try {
			String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/v1";
			Phaseo client = new Phaseo(
				"test",
				baseUrl,
				false,
				false,
				null,
				modelId -> new Phaseo.ModelLifecycleInfo(modelId, "active", "active", null, null, null, null),
				null,
				null
			);
			call.run(client);
		} finally {
			server.stop(0);
		}
		assertNotNull(captured.get(), "server saw no request");
		return captured.get();
	}

	private static List<Part> parseMultipart(Captured captured) {
		assertNotNull(captured.contentType);
		assertTrue(captured.contentType.startsWith("multipart/form-data; boundary="), "content type was " + captured.contentType);
		String boundary = captured.contentType.substring("multipart/form-data; boundary=".length());
		// ISO-8859-1 maps bytes 1:1 so binary file parts survive the round trip.
		String body = new String(captured.body, StandardCharsets.ISO_8859_1);
		String[] chunks = body.split(Pattern.quote("--" + boundary));
		List<Part> parts = new ArrayList<>();
		for (int i = 1; i < chunks.length - 1; i++) {
			String chunk = chunks[i].replaceFirst("^\r\n", "");
			int split = chunk.indexOf("\r\n\r\n");
			String head = chunk.substring(0, split);
			String value = chunk.substring(split + 4).replaceFirst("\r\n$", "");
			Part part = new Part();
			part.name = group(head, "name=\"([^\"]*)\"");
			part.filename = group(head, "filename=\"([^\"]*)\"");
			part.contentType = group(head, "(?i)Content-Type: ([^\r\n]+)");
			part.value = value.getBytes(StandardCharsets.ISO_8859_1);
			parts.add(part);
		}
		return parts;
	}

	private static String group(String text, String regex) {
		Matcher matcher = Pattern.compile(regex).matcher(text);
		return matcher.find() ? matcher.group(1) : null;
	}

	private static Part part(List<Part> parts, String name) {
		return parts.stream().filter(p -> p.name.equals(name)).findFirst().orElse(null);
	}

	private static String text(List<Part> parts, String name) {
		Part p = part(parts, name);
		return p == null ? null : new String(p.value, StandardCharsets.UTF_8);
	}

	private static Phaseo offlineClient() {
		return new Phaseo("test", "http://127.0.0.1:9/v1", false, false, null);
	}

	@Test
	void transcriptionWithPhaseoFileSendsMultipart() throws Exception {
		byte[] audio = new byte[] { 'R', 'I', 'F', 'F', 0, 1, (byte) 0xff, 'w', 'a', 'v' };
		Map<String, Object> request = new LinkedHashMap<>();
		request.put("model", "example/transcribe-1");
		request.put("file", PhaseoFile.fromBytes(audio, "clip.wav", "audio/x-wav"));
		request.put("language", "en");
		request.put("temperature", 0.2);
		request.put("stream", false);
		request.put("timestamp_granularities", List.of("word", "segment"));
		request.put("provider", Map.of("order", List.of("example")));
		Captured captured = capture("{\"text\":\"hello\"}", client -> {
			JsonNode response = client.createTranscription(request);
			assertEquals("hello", response.get("text").asText());
			return response;
		});

		assertEquals("POST", captured.method);
		assertEquals("/v1/audio/transcriptions", captured.path);
		List<Part> parts = parseMultipart(captured);
		Part file = part(parts, "file");
		assertNotNull(file, "file part missing");
		assertEquals("clip.wav", file.filename);
		assertEquals("audio/x-wav", file.contentType);
		assertArrayEquals(audio, file.value);
		assertEquals("example/transcribe-1", text(parts, "model"));
		assertEquals("en", text(parts, "language"));
		assertEquals("0.2", text(parts, "temperature"));
		assertEquals("false", text(parts, "stream"));
		assertEquals("[\"word\",\"segment\"]", text(parts, "timestamp_granularities"));
		assertEquals("{\"order\":[\"example\"]}", text(parts, "provider"));
		assertFalse(parts.stream().anyMatch(p -> p.name.equals("filename")));
	}

	@Test
	void phaseoFileFromStreamAndPathDeriveContentType(@TempDir Path dir) throws Exception {
		PhaseoFile fromStream = PhaseoFile.fromStream(new ByteArrayInputStream("flac-bytes".getBytes(StandardCharsets.UTF_8)), "note.flac");
		assertEquals("note.flac", fromStream.getFileName());
		assertNull(fromStream.getContentType());
		Captured streamed = capture("{\"text\":\"hi\"}", client -> client.createTranscription(Map.of("model", "example/transcribe-1", "file", fromStream)));
		Part streamedFile = part(parseMultipart(streamed), "file");
		assertEquals("note.flac", streamedFile.filename);
		assertEquals("audio/flac", streamedFile.contentType);
		assertEquals("flac-bytes", new String(streamedFile.value, StandardCharsets.UTF_8));

		Path audio = dir.resolve("memo.m4a");
		Files.write(audio, "m4a-bytes".getBytes(StandardCharsets.UTF_8));
		PhaseoFile fromPath = PhaseoFile.fromPath(audio);
		assertEquals("memo.m4a", fromPath.getFileName());
		assertEquals(audio, fromPath.getPath());
		Captured captured = capture("{\"text\":\"hi\"}", client -> client.createTranscription(Map.of("model", "example/transcribe-1", "file", fromPath)));
		Part file = part(parseMultipart(captured), "file");
		assertEquals("memo.m4a", file.filename);
		assertEquals("audio/mp4", file.contentType);
		assertEquals("m4a-bytes", new String(file.value, StandardCharsets.UTF_8));
	}

	@Test
	void transcriptionWithFileUrlOnlySendsJson() throws Exception {
		Captured captured = capture("{\"text\":\"hello\"}", client ->
			client.createTranscription(Map.of("model", "example/transcribe-1", "file_url", "https://example.com/a.mp3"))
		);

		assertEquals("application/json", captured.contentType);
		String body = new String(captured.body, StandardCharsets.UTF_8);
		assertTrue(body.contains("\"file_url\":\"https://example.com/a.mp3\""), body);
		assertTrue(body.contains("\"model\":\"example/transcribe-1\""), body);
	}

	@Test
	void translationWithPathUsesBasename(@TempDir Path dir) throws Exception {
		Path audio = dir.resolve("speech.ogg");
		Files.write(audio, "OggS-bytes".getBytes(StandardCharsets.UTF_8));
		Captured captured = capture("{\"text\":\"hi\"}", client -> client.createTranslation(audio, Map.of("model", "example/transcribe-1")));

		assertEquals("/v1/audio/translations", captured.path);
		List<Part> parts = parseMultipart(captured);
		Part file = part(parts, "file");
		assertNotNull(file, "file part missing");
		assertEquals("speech.ogg", file.filename);
		assertEquals("audio/ogg", file.contentType);
		assertEquals("OggS-bytes", new String(file.value, StandardCharsets.UTF_8));
		assertEquals("example/transcribe-1", text(parts, "model"));
	}

	@Test
	void translationWithFileUsesItsOwnName(@TempDir Path dir) throws Exception {
		Path audio = dir.resolve("memo.webm");
		Files.write(audio, "webm-bytes".getBytes(StandardCharsets.UTF_8));
		File handle = audio.toFile();
		Captured captured = capture("{\"text\":\"hi\"}", client -> client.createTranslation(Map.of("model", "example/transcribe-1", "file", handle)));

		Part file = part(parseMultipart(captured), "file");
		assertEquals("memo.webm", file.filename);
		assertEquals("audio/webm", file.contentType);
		assertEquals("webm-bytes", new String(file.value, StandardCharsets.UTF_8));
	}

	@Test
	void translationWithStreamUsesSiblingFilename() throws Exception {
		Captured captured = capture("{\"text\":\"hi\"}", client -> client.createTranslation(Map.of(
			"model", "example/transcribe-1",
			"file", new ByteArrayInputStream("mp3-bytes".getBytes(StandardCharsets.UTF_8)),
			"filename", "clip.mp3"
		)));

		Part file = part(parseMultipart(captured), "file");
		assertNotNull(file, "file part missing");
		assertEquals("clip.mp3", file.filename);
		assertEquals("audio/mpeg", file.contentType);
		assertEquals("mp3-bytes", new String(file.value, StandardCharsets.UTF_8));
	}

	@Test
	void bytesWithSiblingFilenameAndUnknownExtensionUseOctetStream() throws Exception {
		Captured captured = capture("{\"text\":\"hi\"}", client -> client.createTranscription(Map.of(
			"model", "example/transcribe-1",
			"file", new byte[] { 1, 2 },
			"filename", "clip.xyz"
		)));

		Part file = part(parseMultipart(captured), "file");
		assertEquals("clip.xyz", file.filename);
		assertEquals("application/octet-stream", file.contentType);
	}

	@Test
	void bytesWithoutFilenameThrow() {
		IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> offlineClient().createTranscription(Map.of(
			"model", "example/transcribe-1",
			"file", new byte[] { 1, 2, 3 }
		)));
		assertTrue(error.getMessage().contains("filename"), error.getMessage());
		assertTrue(error.getMessage().contains("extension"), error.getMessage());
	}

	@Test
	void streamWithoutFilenameThrows() {
		assertThrows(IllegalArgumentException.class, () -> offlineClient().createTranslation(Map.of(
			"model", "example/transcribe-1",
			"file", new ByteArrayInputStream(new byte[] { 1 })
		)));
	}

	@Test
	void stringFileThrows() {
		IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> offlineClient().createTranscription(Map.of(
			"model", "example/transcribe-1",
			"file", "clip.wav",
			"filename", "clip.wav"
		)));
		assertTrue(error.getMessage().contains("Path.of"), error.getMessage());
		assertTrue(error.getMessage().contains("PhaseoFile.fromPath"), error.getMessage());
	}

	@Test
	void phaseoFileRequiresFilename() {
		assertThrows(IllegalArgumentException.class, () -> PhaseoFile.fromBytes(new byte[] { 1 }, " "));
	}

	@Test
	void uploadFileSendsMultipartWithModelAndProviderQuery() throws Exception {
		String jsonl = "{\"custom_id\":\"a\"}\n";
		Map<String, Object> request = new LinkedHashMap<>();
		request.put("purpose", "batch");
		request.put("file", PhaseoFile.fromBytes(jsonl.getBytes(StandardCharsets.UTF_8), "input.jsonl", "application/jsonl"));
		request.put("model", "example/chat-1");
		request.put("provider", "example");
		Captured captured = capture("{\"id\":\"file_123\",\"purpose\":\"batch\"}", client -> {
			JsonNode response = client.uploadFile(request);
			assertEquals("file_123", response.get("id").asText());
			return response;
		});

		assertEquals("POST", captured.method);
		assertEquals("/v1/batches/files", captured.path);
		assertEquals("model=example%2Fchat-1&provider=example", captured.query);
		List<Part> parts = parseMultipart(captured);
		Part file = part(parts, "file");
		assertNotNull(file, "file part missing");
		assertEquals("input.jsonl", file.filename);
		assertEquals("application/jsonl", file.contentType);
		assertEquals(jsonl, new String(file.value, StandardCharsets.UTF_8));
		assertEquals("batch", text(parts, "purpose"));
		assertEquals(2, parts.size());
	}
}
