package app.phaseo.sdk;

import app.phaseo.gen.Client;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Builds multipart/form-data bodies for file endpoints (audio transcriptions and translations, batch
 * file uploads) with the standard library only.
 *
 * <p>A file value may be a {@code byte[]}, a {@link Path}, a {@link File}, an {@link InputStream}
 * (read fully, not closed) or a {@code String} of content. Strings are content, never paths: pass a
 * {@link Path} to upload a file from disk.
 */
final class Multipart {
	static final String DEFAULT_AUDIO_FILENAME = "audio.mp3";
	static final String DEFAULT_UPLOAD_FILENAME = "upload";
	/** Form fields the gateway parses from one JSON string. */
	static final Set<String> JSON_FIELDS = Set.of(
		"provider", "debug", "include", "timestamp_granularities", "chunking_strategy", "languages", "keywords", "context_bias"
	);
	private static final Map<String, String> AUDIO_CONTENT_TYPES = Map.of(
		".flac", "audio/flac",
		".mp3", "audio/mpeg",
		".mp4", "audio/mp4",
		".mpeg", "audio/mpeg",
		".mpga", "audio/mpeg",
		".m4a", "audio/mp4",
		".ogg", "audio/ogg",
		".wav", "audio/wav",
		".webm", "audio/webm"
	);
	private static final ObjectMapper MAPPER = new ObjectMapper();
	private static final SecureRandom RANDOM = new SecureRandom();

	private Multipart() {}

	static final class FilePart {
		final byte[] bytes;
		final String filename;

		FilePart(byte[] bytes, String filename) {
			this.bytes = bytes;
			this.filename = filename;
		}
	}

	static boolean isFileValue(Object value) {
		return value instanceof byte[] || value instanceof Path || value instanceof File || value instanceof InputStream || value instanceof String;
	}

	/** Reads a file value; {@code filename} overrides the name taken from a path. */
	static FilePart readFile(Object value, String filename) throws IOException {
		if (value instanceof byte[]) return new FilePart((byte[]) value, filename);
		if (value instanceof Path) {
			Path path = (Path) value;
			return new FilePart(Files.readAllBytes(path), filename != null ? filename : fileName(path));
		}
		if (value instanceof File) {
			Path path = ((File) value).toPath();
			return new FilePart(Files.readAllBytes(path), filename != null ? filename : fileName(path));
		}
		if (value instanceof InputStream) return new FilePart(((InputStream) value).readAllBytes(), filename);
		if (value instanceof String) return new FilePart(((String) value).getBytes(StandardCharsets.UTF_8), filename);
		throw new IllegalArgumentException("file must be a byte[], Path, File, InputStream or String of content");
	}

	private static String fileName(Path path) {
		Path name = path.getFileName();
		return name == null ? null : name.toString();
	}

	static String audioContentType(String filename) {
		int dot = filename.lastIndexOf('.');
		String extension = dot < 0 ? "" : filename.substring(dot).toLowerCase(Locale.ROOT);
		return AUDIO_CONTENT_TYPES.getOrDefault(extension, "application/octet-stream");
	}

	/** Converts a non-file field value to a string: booleans lowercase, maps and lists as JSON. */
	static String fieldValue(Object value) throws JsonProcessingException {
		if (value instanceof Boolean) return ((Boolean) value) ? "true" : "false";
		if (value instanceof String) return (String) value;
		if (value instanceof Map || value instanceof Collection || value instanceof Object[]) return MAPPER.writeValueAsString(value);
		return String.valueOf(value);
	}

	/** Returns name/value pairs, skipping nulls; lists the gateway does not read as JSON repeat the field. */
	static List<String[]> fields(Map<String, Object> payload) throws JsonProcessingException {
		List<String[]> out = new ArrayList<>();
		for (Map.Entry<String, Object> entry : payload.entrySet()) {
			Object value = entry.getValue();
			if (value == null) continue;
			if (value instanceof Collection && !JSON_FIELDS.contains(entry.getKey())) {
				for (Object item : (Collection<?>) value) {
					if (item != null) out.add(new String[] { entry.getKey(), fieldValue(item) });
				}
			} else {
				out.add(new String[] { entry.getKey(), fieldValue(value) });
			}
		}
		return out;
	}

	static Client.RawBody encode(List<String[]> fields, FilePart file, String contentType) {
		byte[] random = new byte[16];
		RANDOM.nextBytes(random);
		String boundary = "----PhaseoBoundary" + HexFormat.of().formatHex(random);
		ByteArrayOutputStream out = new ByteArrayOutputStream(file.bytes.length + 512);
		for (String[] field : fields) {
			write(out, "--" + boundary + "\r\n");
			write(out, "Content-Disposition: form-data; name=\"" + escape(field[0]) + "\"\r\n\r\n");
			write(out, field[1]);
			write(out, "\r\n");
		}
		write(out, "--" + boundary + "\r\n");
		write(out, "Content-Disposition: form-data; name=\"file\"; filename=\"" + escape(file.filename) + "\"\r\n");
		write(out, "Content-Type: " + contentType + "\r\n\r\n");
		out.writeBytes(file.bytes);
		write(out, "\r\n--" + boundary + "--\r\n");
		return new Client.RawBody("multipart/form-data; boundary=" + boundary, out.toByteArray());
	}

	/**
	 * Builds an audio request body from a payload whose "file" entry holds the audio. "filename" (its
	 * extension names the format; defaults to the file's name, then audio.mp3) and "content_type"
	 * name the part and are not sent as fields.
	 */
	static Client.RawBody audioBody(Map<String, Object> payload) throws IOException {
		Map<String, Object> fields = new LinkedHashMap<>(payload);
		Object file = fields.remove("file");
		Object filename = fields.remove("filename");
		Object contentType = fields.remove("content_type");
		FilePart part = readFile(file, filename == null ? null : filename.toString());
		String name = part.filename == null || part.filename.isEmpty() ? DEFAULT_AUDIO_FILENAME : part.filename;
		String type = contentType == null ? audioContentType(name) : contentType.toString();
		return encode(fields(fields), new FilePart(part.bytes, name), type);
	}

	/** Percent-encodes quotes and line breaks in a Content-Disposition value, as browsers do. */
	private static String escape(String value) {
		return value.replace("\"", "%22").replace("\r", "%0D").replace("\n", "%0A");
	}

	private static void write(ByteArrayOutputStream out, String value) {
		out.writeBytes(value.getBytes(StandardCharsets.UTF_8));
	}
}
