from typing import Any

from phaseo import Phaseo
from gen import operations as ops


def test_generate_image_helpers_use_generated_operations(monkeypatch):
    captured: list[tuple[str, dict[str, Any]]] = []

    def fake_create_image(_client, body=None, **_kwargs):
        captured.append(("createImage", dict(body or {})))
        return {
            "created": 1_723_000_000,
            "data": [{"url": "https://cdn.example.test/image.png"}],
        }

    def fake_create_image_edit(_client, body=None, **_kwargs):
        captured.append(("createImageEdit", dict(body or {})))
        return {
            "created": 1_723_000_001,
            "data": [{"url": "https://cdn.example.test/edit.png"}],
        }

    monkeypatch.setattr(ops, "createImage", fake_create_image)
    monkeypatch.setattr(ops, "createImageEdit", fake_create_image_edit)

    client = Phaseo(api_key="sk_test_123", base_url="https://example.test", enable_deprecation_warnings=False)
    image = client.generate_image({"model": "openai/gpt-image-1", "prompt": "Golden hour lighthouse"})
    edited = client.generate_image_edit(
        {
            "model": "openai/gpt-image-1",
            "prompt": "Make it sunset",
            "image": "data:image/png;base64,...",
        }
    )

    assert image["data"][0]["url"] == "https://cdn.example.test/image.png"
    assert edited["data"][0]["url"] == "https://cdn.example.test/edit.png"
    assert captured == [
        ("createImage", {"model": "openai/gpt-image-1", "prompt": "Golden hour lighthouse"}),
        (
            "createImageEdit",
            {
                "model": "openai/gpt-image-1",
                "prompt": "Make it sunset",
                "image": "data:image/png;base64,...",
            },
        ),
    ]


def test_generate_audio_helpers_use_generated_operations(monkeypatch):
    captured: list[tuple[str, dict[str, Any]]] = []

    def fake_create_speech(_client, body=None, **_kwargs):
        captured.append(("createSpeech", dict(body or {})))
        return {"audio": "base64-audio", "format": "mp3"}

    def fake_create_transcription(_client, body=None, **_kwargs):
        captured.append(("createTranscription", dict(body or {})))
        return {"text": "hello world", "language": "en"}

    def fake_create_translation(_client, body=None, **_kwargs):
        captured.append(("createTranslation", dict(body or {})))
        return {"text": "translated hello world", "language": "en"}

    monkeypatch.setattr(ops, "createSpeech", fake_create_speech)
    monkeypatch.setattr(ops, "createTranscription", fake_create_transcription)
    monkeypatch.setattr(ops, "createTranslation", fake_create_translation)

    client = Phaseo(api_key="sk_test_123", base_url="https://example.test", enable_deprecation_warnings=False)
    speech = client.generate_speech({"model": "openai/gpt-4o-mini-tts", "input": "Hello world"})
    transcription = client.generate_transcription(
        {"model": "openai/gpt-4o-transcribe", "audio_b64": "base64-audio"}
    )
    translation = client.generate_translation(
        {"model": "openai/gpt-4o-transcribe", "audio_b64": "base64-audio"}
    )

    assert speech == {"audio": "base64-audio", "format": "mp3"}
    assert transcription == {"text": "hello world", "language": "en"}
    assert translation == {"text": "translated hello world", "language": "en"}
    assert captured == [
        ("createSpeech", {"model": "openai/gpt-4o-mini-tts", "input": "Hello world"}),
        ("createTranscription", {"model": "openai/gpt-4o-transcribe", "audio_b64": "base64-audio"}),
        ("createTranslation", {"model": "openai/gpt-4o-transcribe", "audio_b64": "base64-audio"}),
    ]
