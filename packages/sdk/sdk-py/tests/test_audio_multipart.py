"""Audio transcription/translation and batch file uploads use multipart/form-data (PHA-574)."""
from __future__ import annotations

import asyncio
import io
import json
from email.parser import BytesParser
from email.policy import HTTP
from typing import Any, Callable

import httpx

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
    client.audio.translations.create({"model": "openai/whisper-1", "file": str(path)})
    with path.open("rb") as handle:
        client.audio.transcriptions.create({"model": "openai/whisper-1", "file": handle})
    client.audio.translations.create({"model": "openai/whisper-1", "file": io.BytesIO(AUDIO)})

    assert [request.url.path for request in seen] == [
        "/v1/audio/translations", "/v1/audio/translations", "/v1/audio/transcriptions", "/v1/audio/translations",
    ]
    filenames = []
    for request in seen:
        assert request.headers["content-type"].startswith("multipart/form-data")
        form = parse_form(request)
        assert form["file"][0]["value"] == AUDIO
        assert form["model"][0]["value"] == b"openai/whisper-1"
        filenames.append((form["file"][0]["filename"], form["file"][0]["content_type"]))
    assert filenames == [
        ("meeting.m4a", "audio/mp4"), ("meeting.m4a", "audio/mp4"), ("meeting.m4a", "audio/mp4"), ("audio.mp3", "audio/mpeg"),
    ]


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
            await client.audio.translations.create({"model": "openai/whisper-1", "file": AUDIO})
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
    assert translation["file"][0]["filename"] == "audio.mp3"
    assert translation["model"][0]["value"] == b"openai/whisper-1"

    assert seen[2].headers["content-type"] == "application/json"
    assert json.loads(seen[2].content) == {"model": "elevenlabs/scribe-v2", "file_id": "file_9"}

    assert seen[3].headers["content-type"].startswith("multipart/form-data")
    assert dict(seen[3].url.params) == {"model": "openai/gpt-5-mini", "provider": "openai"}
