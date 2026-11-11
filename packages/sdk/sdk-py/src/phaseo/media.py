from __future__ import annotations

from contextlib import contextmanager
import json
from os import PathLike
from pathlib import Path
from typing import Any, BinaryIO, Iterable, Iterator

# Mirrors the gateway's FORM_JSON_FIELDS: object/array form fields it parses from one JSON string.
FORM_JSON_FIELDS = frozenset({
    "provider", "debug", "include", "timestamp_granularities", "chunking_strategy", "languages",
    "keywords", "context_bias", "input_reference", "models",
})
AUDIO_CONTENT_TYPES = {
    ".flac": "audio/flac", ".mp3": "audio/mpeg", ".mp4": "audio/mp4", ".mpeg": "audio/mpeg", ".mpga": "audio/mpeg",
    ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav", ".webm": "audio/webm",
}
DEFAULT_AUDIO_FILENAME = "audio.mp3"


@contextmanager
def upload_input(value: Any, filename: str = "upload", content_type: str = "application/octet-stream"):
    """Accept bytes, a path (str or PathLike), a file object, or an explicit HTTPX file tuple."""
    if isinstance(value, (str, PathLike)):
        path = Path(value)
        with path.open("rb") as stream:
            yield (path.name, stream, content_type)
    elif isinstance(value, tuple):
        yield value
    elif isinstance(value, (bytes, bytearray)) or hasattr(value, "read"):
        yield (filename, value, content_type)
    else:
        raise TypeError("file must be bytes, a path, a file object, or a file tuple")


@contextmanager
def audio_upload(value: Any, filename: str | None = None, content_type: str | None = None):
    """Build the multipart `file` part for audio endpoints.

    The filename extension tells the gateway and provider the audio format, so it defaults to the
    path's name, then an open file's name, then `audio.mp3`. Pass `filename` for raw bytes.
    """
    if isinstance(value, tuple):
        yield value
        return
    if filename is None:
        name = value if isinstance(value, (str, PathLike)) else getattr(value, "name", None)
        filename = Path(name).name if isinstance(name, (str, PathLike)) and str(name) else DEFAULT_AUDIO_FILENAME
    if content_type is None:
        content_type = AUDIO_CONTENT_TYPES.get(Path(filename).suffix.lower(), "application/octet-stream")
    if isinstance(value, (str, PathLike)):
        with Path(value).open("rb") as stream:
            yield (filename, stream, content_type)
    else:
        with upload_input(value, filename, content_type) as part:
            yield part


def _form_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value)
    return str(value)


def form_fields(payload: dict[str, Any]) -> Iterator[tuple[str, tuple[None, str]]]:
    """Encode non-file request fields as multipart text parts the gateway can parse.

    Objects, and lists the gateway reads as JSON, go as one JSON string; other lists repeat the field.
    """
    for name, value in payload.items():
        if value is None:
            continue
        if isinstance(value, (list, tuple)) and name not in FORM_JSON_FIELDS:
            for item in value:
                yield name, (None, _form_value(item))
        else:
            yield name, (None, _form_value(value))


def download_to(chunks: Iterable[bytes], destination: BinaryIO) -> None:
    """Stream into a caller-owned binary file; close the source on early failure."""
    try:
        for chunk in chunks:
            remaining = memoryview(chunk)
            while remaining:
                written = destination.write(remaining)
                if not written:
                    raise OSError("Destination made no progress")
                remaining = remaining[written:]
    finally:
        close = getattr(chunks, "close", None)
        if close:
            close()
