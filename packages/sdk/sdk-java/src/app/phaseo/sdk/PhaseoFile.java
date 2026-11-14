package app.phaseo.sdk;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;

/**
 * A file to upload: its content, a required filename and an optional content type.
 *
 * <p>The gateway reads the audio format from the filename extension. When the content type is not
 * set, the SDK derives it from that extension, falling back to {@code application/octet-stream}.
 *
 * <pre>{@code
 * client.createTranscription(Map.of(
 *     "model", "example/transcribe-1",
 *     "file", PhaseoFile.fromBytes(audioBytes, "clip.wav")
 * ));
 * }</pre>
 */
public final class PhaseoFile {
	private final byte[] content;
	private final InputStream stream;
	private final Path path;
	private final String fileName;
	private final String contentType;

	private PhaseoFile(byte[] content, InputStream stream, Path path, String fileName, String contentType) {
		if (fileName == null || fileName.isBlank()) {
			throw new IllegalArgumentException("PhaseoFile needs a filename such as \"audio.mp3\": the gateway reads the audio format from its extension");
		}
		this.content = content;
		this.stream = stream;
		this.path = path;
		this.fileName = fileName;
		this.contentType = contentType == null || contentType.isBlank() ? null : contentType;
	}

	/** A file from bytes in memory, named {@code fileName}; the content type comes from its extension. */
	public static PhaseoFile fromBytes(byte[] content, String fileName) {
		return fromBytes(content, fileName, null);
	}

	/** A file from bytes in memory with an explicit content type (null derives it from the extension). */
	public static PhaseoFile fromBytes(byte[] content, String fileName, String contentType) {
		Objects.requireNonNull(content, "content");
		return new PhaseoFile(content, null, null, fileName, contentType);
	}

	/** A file read from disk when the request is sent, named by the path's last segment. */
	public static PhaseoFile fromPath(Path path) {
		return fromPath(path, null);
	}

	/** A file read from disk with an explicit content type (null derives it from the extension). */
	public static PhaseoFile fromPath(Path path, String contentType) {
		Objects.requireNonNull(path, "path");
		Path name = path.getFileName();
		return new PhaseoFile(null, null, path, name == null ? null : name.toString(), contentType);
	}

	/** A file read from {@code stream} (read fully when the request is sent, not closed), named {@code fileName}. */
	public static PhaseoFile fromStream(InputStream stream, String fileName) {
		return fromStream(stream, fileName, null);
	}

	/** A file read from {@code stream} with an explicit content type (null derives it from the extension). */
	public static PhaseoFile fromStream(InputStream stream, String fileName, String contentType) {
		Objects.requireNonNull(stream, "stream");
		return new PhaseoFile(null, stream, null, fileName, contentType);
	}

	/** The filename sent with the upload. */
	public String getFileName() {
		return fileName;
	}

	/** The explicit content type, or null when it is derived from the filename extension. */
	public String getContentType() {
		return contentType;
	}

	/** The path this file reads from, or null when it was built from bytes or a stream. */
	public Path getPath() {
		return path;
	}

	/** The stream this file reads from, or null when it was built from bytes or a path. */
	public InputStream getStream() {
		return stream;
	}

	/** Reads the content: the bytes, the whole stream, or the file at the path. */
	public byte[] readContent() throws IOException {
		if (content != null) return content;
		if (stream != null) return stream.readAllBytes();
		return Files.readAllBytes(path);
	}
}
