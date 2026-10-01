from __future__ import annotations

from contextlib import contextmanager
from os import PathLike
from pathlib import Path
from typing import Any, BinaryIO, Iterable


@contextmanager
def upload_input(value: Any, filename: str = "upload", content_type: str = "application/octet-stream"):
    """Accept bytes, a PathLike, a file object, or an explicit HTTPX file tuple."""
    if isinstance(value, PathLike):
        path = Path(value)
        with path.open("rb") as stream:
            yield (path.name, stream, content_type)
    elif isinstance(value, tuple):
        yield value
    elif isinstance(value, (bytes, bytearray)) or hasattr(value, "read"):
        yield (filename, value, content_type)
    else:
        raise TypeError("file must be bytes, a PathLike, a file object, or a file tuple")


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
