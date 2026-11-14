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
 * <p>A file value is a {@link PhaseoFile}, a {@link Path} or {@link File} (named by its basename), or
 * a {@code byte[]} or {@link InputStream} (read fully, not closed) named by the request's "filename"
 * entry. A {@code String} is never a file.
 */
final class Multipart {
	static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";
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
		final String contentType;

		FilePart(byte[] bytes, String filename, String contentType) {
			this.bytes = bytes;
			this.filename = filename;
			this.contentType = contentType;
		}
	}

	/**
	 * Resolves a file value. {@code filename} and {@code contentType} are the request's sibling
	 * "filename" and "content_type" entries (either may be null). The filename is the
	 * {@link PhaseoFile}'s own name, the basename of a {@link Path} or {@link File}, or {@code filename}
	 * for {@code byte[]} and {@link InputStream} values; without one this throws, because the gateway
	 * reads the format from the extension. The content type is the explicit one, else looked up from
	 * the extension, else application/octet-stream.
	 */
	static FilePart resolve(Object value, String filename, String contentType) throws IOException {
		String siblingName = blankToNull(filename);
		String explicitType = blankToNull(contentType);
		byte[] bytes;
		String name;
		if (value instanceof PhaseoFile) {
			PhaseoFile file = (PhaseoFile) value;
			bytes = file.readContent();
			name = file.getFileName();
			if (file.getContentType() != null) explicitType = file.getContentType();
		} else if (value instanceof Path) {
			Path path = (Path) value;
			bytes = Files.readAllBytes(path);
			name = fileName(path);
		} else if (value instanceof File) {
			Path path = ((File) value).toPath();
			bytes = Files.readAllBytes(path);
			name = fileName(path);
		} else if (value instanceof byte[]) {
			bytes = (byte[]) value;
			name = siblingName;
		} else if (value instanceof InputStream) {
			bytes = ((InputStream) value).readAllBytes();
			name = siblingName;
		} else if (value instanceof CharSequence) {
			throw new IllegalArgumentException(
				"file must not be a String: pass Path.of(\"audio.mp3\") or PhaseoFile.fromPath(...) for a file on disk, "
					+ "or PhaseoFile.fromBytes(bytes, \"audio.mp3\") for bytes in memory"
			);
		} else {
			throw new IllegalArgumentException(
				"file must be a PhaseoFile, Path, File, byte[] or InputStream, not " + (value == null ? "null" : value.getClass().getName())
			);
		}
		if (name == null || name.isBlank()) {
			throw new IllegalArgumentException(
				"file has no filename: pass \"filename\" (for example \"audio.mp3\") with the bytes or stream, or use "
					+ "PhaseoFile.fromBytes(bytes, \"audio.mp3\"), because the gateway reads the audio format from its extension"
			);
		}
		return new FilePart(bytes, name, explicitType != null ? explicitType : contentTypeFor(name));
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value;
	}

	private static String fileName(Path path) {
		Path name = path.getFileName();
		return name == null ? null : name.toString();
	}

	/** Looks up a content type from the filename extension, else application/octet-stream. */
	static String contentTypeFor(String filename) {
		int dot = filename.lastIndexOf('.');
		String extension = dot < 0 ? "" : filename.substring(dot).toLowerCase(Locale.ROOT);
		return AUDIO_CONTENT_TYPES.getOrDefault(extension, DEFAULT_CONTENT_TYPE);
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

	static Client.RawBody encode(List<String[]> fields, FilePart file) {
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
		write(out, "Content-Type: " + file.contentType + "\r\n\r\n");
		out.writeBytes(file.bytes);
		write(out, "\r\n--" + boundary + "--\r\n");
		return new Client.RawBody("multipart/form-data; boundary=" + boundary, out.toByteArray());
	}

	/**
	 * Builds a request body from a payload whose "file" entry holds the file (see {@link #resolve}).
	 * "filename" and "content_type" name the part and are not sent as fields.
	 */
	static Client.RawBody fileBody(Map<String, Object> payload) throws IOException {
		Map<String, Object> fields = new LinkedHashMap<>(payload);
		Object file = fields.remove("file");
		Object filename = fields.remove("filename");
		Object contentType = fields.remove("content_type");
		FilePart part = resolve(file, filename == null ? null : filename.toString(), contentType == null ? null : contentType.toString());
		return encode(fields(fields), part);
	}

	/** Percent-encodes quotes and line breaks in a Content-Disposition value, as browsers do. */
	private static String escape(String value) {
		return value.replace("\"", "%22").replace("\r", "%0D").replace("\n", "%0A");
	}

	private static void write(ByteArrayOutputStream out, String value) {
		out.writeBytes(value.getBytes(StandardCharsets.UTF_8));
	}
}
