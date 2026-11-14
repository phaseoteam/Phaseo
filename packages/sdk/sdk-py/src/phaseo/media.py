from __future__ import annotations

from contextlib import contextmanager
import json
import mimetypes
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


@contextmanager
def upload_input(value: Any, filename: str | None = None, content_type: str | None = None, *,
                 fallback_filename: str | None = None):
    """Build a multipart file part from an explicit file value.

    Accepts a file dict `{"file_name": ..., "content": bytes | binary IO, "content_type": ...}`, an
    HTTPX `(name, content[, type])` tuple, raw bytes or a binary file object, or a path object such as
    `pathlib.Path`. A plain `str` is never treated as a file. `filename` and `content_type` are the
    request's sibling keys. The gateway reads the format from the filename extension, so a value whose
    name can't be known raises `ValueError` unless the caller passes `fallback_filename`.
    """
    if isinstance(value, tuple):
        yield value
        return
    if isinstance(value, str):
        raise TypeError(
            "file must not be a plain string: pass pathlib.Path(...) for a file on disk, "
            'or {"file_name": ..., "content": ...} for in-memory content'
        )
    if isinstance(value, dict):
        content = value.get("content")
        if not isinstance(content, (bytes, bytearray)) and not hasattr(content, "read"):
            raise TypeError('file dict "content" must be bytes or a binary file object')
        filename = value.get("file_name") or filename
        content_type = value.get("content_type") or content_type
        value = content
    if isinstance(value, PathLike):
        path = Path(value)
        name = filename or path.name
        with path.open("rb") as stream:
            yield (name, stream, content_type or guess_content_type(name))
        return
    if not isinstance(value, (bytes, bytearray)) and not hasattr(value, "read"):
        raise TypeError(
            'file must be a file dict {"file_name": ..., "content": ...}, bytes, a binary file object, '
            "a pathlib.Path, or a (name, content[, content_type]) tuple"
        )
    if not filename:
        own_name = getattr(value, "name", None)
        if isinstance(own_name, (str, PathLike)) and str(own_name):
            filename = Path(own_name).name
    filename = filename or fallback_filename
    if not filename:
        raise ValueError(
            'file needs a filename: pass "filename" (or "file_name" in the file dict), '
            "because the gateway reads the file format from its extension"
        )
    content = bytes(value) if isinstance(value, bytearray) else value
    yield (filename, content, content_type or guess_content_type(filename))


def guess_content_type(filename: str) -> str:
    """Content type from the filename extension, else `application/octet-stream`."""
    suffix = Path(filename).suffix.lower()
    return AUDIO_CONTENT_TYPES.get(suffix) or mimetypes.guess_type(filename)[0] or "application/octet-stream"


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
