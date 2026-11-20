"""Audio transcription/translation and batch file uploads use multipart/form-data (PHA-574)."""
from __future__ import annotations

import asyncio
import io
import json
from email.parser import BytesParser
from email.policy import HTTP
from typing import Any, Callable

import httpx
import pytest

from phaseo import AsyncPhaseo, Phaseo

AUDIO = b"ID3\x00fake-mp3-bytes"


def parse_form(request: httpx.Request) -> dict[str, list[dict[str, Any]]]:
    content_type = request.headers["content-type"]
    message = BytesParser(policy=HTTP).parsebytes(b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + request.content)
    parts: dict[str, list[dict[str, Any]]] = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        parts.setdefault(name, []).append({
            "filename": part.get_filename(),
            "content_type": part.get_content_type() if part.get("content-type") else None,
            "value": part.get_payload(decode=True),
        })
    return parts


def sync_client(handle: Callable[[httpx.Request], httpx.Response], seen: list[httpx.Request]) -> Phaseo:
    def route(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/data/models"):
            return httpx.Response(200, json={"models": []})
        request.read()
        seen.append(request)
        return handle(request)

    http = httpx.Client(transport=httpx.MockTransport(route))
    return Phaseo(api_key="test", base_url="https://example.test/v1", http_client=http, enable_deprecation_warnings=False)


def ok(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"text": "hello"})


def test_sync_transcription_with_file_sends_multipart_with_encoded_fields():
    seen: list[httpx.Request] = []
    client = sync_client(ok, seen)
    result = client.generate_transcription({
        "model": "openai/gpt-4o-transcribe",
        "file": AUDIO,
        "filename": "clip.wav",
        "language": "en",
        "temperature": 0.2,
        "stream": False,
        "provider": {"order": ["openai"], "allow_fallbacks": False},
        "timestamp_granularities": ["word", "segment"],
        "known_speaker_names": ["Ada", "Grace"],
        "prompt": None,
    })

    assert result["text"] == "hello"
    request = seen[0]
    assert request.url.path == "/v1/audio/transcriptions"
    assert request.headers["content-type"].startswith("multipart/form-data")
    form = parse_form(request)
    assert form["file"][0]["filename"] == "clip.wav"
    assert form["file"][0]["content_type"] == "audio/wav"
    assert form["file"][0]["value"] == AUDIO
    assert form["model"][0]["value"] == b"openai/gpt-4o-transcribe"
    assert form["language"][0]["value"] == b"en"
    assert form["temperature"][0]["value"] == b"0.2"
    assert form["stream"][0]["value"] == b"false"
    assert json.loads(form["provider"][0]["value"]) == {"order": ["openai"], "allow_fallbacks": False}
    assert json.loads(form["timestamp_granularities"][0]["value"]) == ["word", "segment"]
    assert [part["value"] for part in form["known_speaker_names"]] == [b"Ada", b"Grace"]
    for key in ("prompt", "filename", "content_type"):
        assert key not in form


def test_sync_translation_resource_accepts_path_and_file_object(tmp_path):
    seen: list[httpx.Request] = []
    client = sync_client(ok, seen)
    path = tmp_path / "meeting.m4a"
    path.write_bytes(AUDIO)

    client.audio.translations.create({"model": "openai/whisper-1", "file": path})
    with path.open("rb") as handle:
        client.audio.transcriptions.create({"model": "openai/whisper-1", "file": handle})
    client.audio.translations.create({"model": "openai/whisper-1", "file": io.BytesIO(AUDIO), "filename": "note.mp3"})
    client.audio.translations.create({
        "model": "openai/whisper-1", "file": {"file_name": "take.webm", "content": AUDIO, "content_type": "video/webm"},
    })

    assert [request.url.path for request in seen] == [
        "/v1/audio/translations", "/v1/audio/transcriptions", "/v1/audio/translations", "/v1/audio/translations",
    ]
    filenames = []
    for request in seen:
        assert request.headers["content-type"].startswith("multipart/form-data")
        form = parse_form(request)
        assert form["file"][0]["value"] == AUDIO
        assert form["model"][0]["value"] == b"openai/whisper-1"
        filenames.append((form["file"][0]["filename"], form["file"][0]["content_type"]))
    assert filenames == [
        ("meeting.m4a", "audio/mp4"), ("meeting.m4a", "audio/mp4"), ("note.mp3", "audio/mpeg"), ("take.webm", "video/webm"),
    ]


def test_file_values_follow_the_explicit_file_rule(tmp_path):
    seen: list[httpx.Request] = []
    client = sync_client(ok, seen)
    path = tmp_path / "meeting.flac"
    path.write_bytes(AUDIO)

    with pytest.raises(TypeError, match=r"pathlib\.Path"):
        client.generate_transcription({"model": "openai/whisper-1", "file": str(path)})
    with pytest.raises(ValueError, match="filename"):
        client.generate_transcription({"model": "openai/whisper-1", "file": AUDIO})
    with pytest.raises(ValueError, match="filename"):
        client.audio.translations.create({"model": "openai/whisper-1", "file": io.BytesIO(AUDIO)})
    with pytest.raises(ValueError, match="filename"):
        client.upload_file(purpose="batch", file=b"{}")
    with pytest.raises(TypeError, match=r"pathlib\.Path"):
        client.files.create({"purpose": "batch", "file": "batch.jsonl"})
    assert seen == []

    client.generate_transcription({"model": "openai/whisper-1", "file": {"file_name": "clip.wav", "content": AUDIO}})
    client.generate_transcription({"model": "openai/whisper-1", "file": path})
    client.generate_transcription({"model": "openai/whisper-1", "file": bytearray(AUDIO), "filename": "x.ogg",
                                   "content_type": "audio/x-custom"})
    client.generate_transcription({"model": "openai/whisper-1", "file": ("raw.bin", AUDIO, "audio/wav")})
    client.upload_file(purpose="batch", file=b"{}", filename="batch.json")

    parts = [parse_form(request)["file"][0] for request in seen]
    assert [(part["filename"], part["content_type"]) for part in parts] == [
        ("clip.wav", "audio/wav"), ("meeting.flac", "audio/flac"), ("x.ogg", "audio/x-custom"),
        ("raw.bin", "audio/wav"), ("batch.json", "application/json"),
    ]
    assert all(part["value"] in (AUDIO, b"{}") for part in parts)
    assert "content_type" not in parse_form(seen[2])


def test_upload_file_reads_path_and_keeps_explicit_keywords(tmp_path):
    seen: list[httpx.Request] = []
    client = sync_client(lambda _request: httpx.Response(200, json={"id": "file_1"}), seen)
    path = tmp_path / "rows.jsonl"
    path.write_bytes(b'{"custom_id":"a"}\n')

    client.upload_file(purpose="batch", file=path, content_type="application/jsonl")
    with path.open("rb") as handle:
        client.files.create({"purpose": "batch", "file": handle, "filename": "renamed.jsonl"})
    client.files.create({"purpose": "batch", "file": {"file_name": "inline.jsonl", "content": io.BytesIO(b"{}")}})

    parts = [parse_form(request)["file"][0] for request in seen]
    assert [(part["filename"], part["value"]) for part in parts] == [
        ("rows.jsonl", b'{"custom_id":"a"}\n'), ("renamed.jsonl", b'{"custom_id":"a"}\n'), ("inline.jsonl", b"{}"),
    ]
    assert parts[0]["content_type"] == "application/jsonl"


def test_sync_transcription_by_url_stays_json():
    seen: list[httpx.Request] = []
    client = sync_client(ok, seen)
    client.audio.transcriptions.create({"model": "mistral/voxtral-mini", "file_url": "https://cdn.example.test/a.mp3"})

    request = seen[0]
    assert request.headers["content-type"] == "application/json"
    assert json.loads(request.content) == {"model": "mistral/voxtral-mini", "file_url": "https://cdn.example.test/a.mp3"}


def test_sync_upload_file_sends_model_and_provider_as_query():
    seen: list[httpx.Request] = []
    client = sync_client(lambda _request: httpx.Response(200, json={"id": "file_1"}), seen)
    client.upload_file(purpose="batch", file=b"{}", filename="batch.jsonl", model="openai/gpt-5-mini", provider="openai")
    client.files.create({"purpose": "batch", "file": b"{}", "filename": "batch.jsonl", "model": "openai/gpt-5-mini"})

    assert dict(seen[0].url.params) == {"model": "openai/gpt-5-mini", "provider": "openai"}
    assert dict(seen[1].url.params) == {"model": "openai/gpt-5-mini"}
    for request in seen:
        form = parse_form(request)
        assert form["purpose"][0]["value"] == b"batch"
        assert "model" not in form


def test_async_audio_and_upload_use_multipart():
    seen: list[httpx.Request] = []

    async def handle(request: httpx.Request) -> httpx.Response:
        await request.aread()
        seen.append(request)
        return httpx.Response(200, json={"id": "file_1"} if request.url.path.endswith("/batches/files") else {"text": "hello"})

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
            client = AsyncPhaseo(api_key="test", base_url="https://example.test/v1", http_client=http)
            await client.audio.transcriptions.create({
                "model": "openai/gpt-4o-transcribe", "file": AUDIO, "filename": "clip.ogg",
                "provider": {"only": ["openai"]}, "stream": True,
            })
            await client.audio.translations.create({"model": "openai/whisper-1", "file": {"file_name": "a.mp3", "content": AUDIO}})
            for bad, error in (("clip.mp3", TypeError), (AUDIO, ValueError)):
                with pytest.raises(error):
                    await client.audio.translations.create({"model": "openai/whisper-1", "file": bad})
                with pytest.raises(error):
                    await client.files.create({"purpose": "batch", "file": bad})
            await client.audio.transcriptions.create({"model": "elevenlabs/scribe-v2", "file_id": "file_9"})
            await client.files.create({"purpose": "batch", "file": b"{}", "filename": "batch.jsonl",
                                       "model": "openai/gpt-5-mini", "provider": "openai"})

    asyncio.run(run())

    transcription = parse_form(seen[0])
    assert seen[0].url.path == "/v1/audio/transcriptions"
    assert seen[0].headers["content-type"].startswith("multipart/form-data")
    assert transcription["file"][0]["filename"] == "clip.ogg"
    assert transcription["file"][0]["content_type"] == "audio/ogg"
    assert transcription["model"][0]["value"] == b"openai/gpt-4o-transcribe"
    assert transcription["stream"][0]["value"] == b"true"
    assert json.loads(transcription["provider"][0]["value"]) == {"only": ["openai"]}

    translation = parse_form(seen[1])
    assert seen[1].url.path == "/v1/audio/translations"
    assert translation["file"][0]["filename"] == "a.mp3"
    assert translation["file"][0]["content_type"] == "audio/mpeg"
    assert translation["model"][0]["value"] == b"openai/whisper-1"

    assert seen[2].headers["content-type"] == "application/json"
    assert json.loads(seen[2].content) == {"model": "elevenlabs/scribe-v2", "file_id": "file_9"}

    assert seen[3].headers["content-type"].startswith("multipart/form-data")
    assert dict(seen[3].url.params) == {"model": "openai/gpt-5-mini", "provider": "openai"}
