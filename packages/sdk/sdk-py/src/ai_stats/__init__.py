from __future__ import annotations

from typing import Any, Dict, Iterator, Optional, Union
from pathlib import Path
import sys
from typing_extensions import NotRequired, TypedDict

import httpx

_gen_root = Path(__file__).resolve().parent.parent / "gen"
if _gen_root.exists():
    sys.path.insert(0, str(_gen_root))

from ai_stats_generated import ApiClient, Configuration  # type: ignore
from ai_stats_generated.api.default_api import DefaultApi  # type: ignore
from ai_stats_generated import models  # type: ignore

DEFAULT_BASE_URL = "https://api.phaseo.app/v1"
DEFAULT_USER_AGENT = "ai-stats-python"


def _coerce_model(model_cls: Any, value: Any) -> Any:
    if isinstance(value, model_cls):
        return value
    if isinstance(value, dict) and hasattr(model_cls, "from_dict"):
        return model_cls.from_dict(value)
    if hasattr(model_cls, "model_validate"):
        return model_cls.model_validate(value)
    return value


class _ChatCompletionsResource:
    def __init__(self, parent: "AIStats"):
        self._parent = parent

    def create(self, params: models.ChatCompletionsRequest | ChatCompletionsParams):
        payload = dict(params)
        if payload.get("stream"):
            return self._parent.stream_text(payload)
        return self._parent.generate_text(payload)


class _ChatResource:
    def __init__(self, parent: "AIStats"):
        self.completions = _ChatCompletionsResource(parent)


class _ResponsesResource:
    def __init__(self, parent: "AIStats"):
        self._parent = parent

    def create(self, params: models.ResponsesRequest):
        payload = dict(params)
        if payload.get("stream"):
            return self._parent.stream_response(payload)
        return self._parent.generate_response(payload)


class _MessagesResource:
    def __init__(self, parent: "AIStats"):
        self._parent = parent

    def create(self, params: models.AnthropicMessagesRequest) -> dict[str, Any] | Iterator[str]:
        payload = dict(params)
        if payload.get("stream"):
            return self._parent.stream_messages(payload)
        return self._parent.generate_message(payload)


class _ImagesResource:
    def __init__(self, parent: "AIStats"):
        self._parent = parent

    def generate(self, params: models.ImagesGenerationRequest) -> dict[str, Any]:
        return self._parent.generate_image(params)


class _AudioSpeechResource:
    def __init__(self, parent: "AIStats"):
        self._parent = parent

    def create(self, params: models.AudioSpeechRequest) -> bytes:
        return self._parent.generate_speech(params)


class _AudioTranscriptionsResource:
    def __init__(self, parent: "AIStats"):
        self._parent = parent

    def create(self, params: models.AudioTranscriptionRequest) -> dict[str, Any]:
        return self._parent.generate_transcription(dict(params))


class _AudioTranslationsResource:
    def __init__(self, parent: "AIStats"):
        self._parent = parent

    def create(self, params: models.AudioTranslationRequest) -> dict[str, Any]:
        return self._parent.generate_translation(dict(params))


class _AudioResource:
    def __init__(self, parent: "AIStats"):
        self.speech = _AudioSpeechResource(parent)
        self.transcriptions = _AudioTranscriptionsResource(parent)
        self.translations = _AudioTranslationsResource(parent)


class _ModerationsResource:
    def __init__(self, parent: "AIStats"):
        self._parent = parent

    def create(self, params: models.ModerationsRequest) -> dict[str, Any]:
        return self._parent.generate_moderation(params)


class _BatchesResource:
    def __init__(self, parent: "AIStats"):
        self._parent = parent

    def create(self, params: models.BatchRequest | dict[str, Any]) -> dict[str, Any]:
        return self._parent.create_batch(params)

    def retrieve(self, batch_id: str) -> dict[str, Any]:
        return self._parent.get_batch(batch_id)


class _FilesResource:
    def __init__(self, parent: "AIStats"):
        self._parent = parent

    def create(self, params: dict[str, Any]) -> dict[str, Any]:
        return self._parent.upload_file(**params)

    def list(self) -> dict[str, Any]:
        return self._parent.list_files()

    def retrieve(self, file_id: str) -> dict[str, Any]:
        return self._parent.get_file(file_id)


class _ModelsResource:
    def __init__(self, parent: "AIStats"):
        self._parent = parent

    def list(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._parent.get_models(params)


class ChatCompletionsParams(TypedDict, total=False):
    model: models.ModelId
    messages: list[models.ChatMessage]
    reasoning: NotRequired[list[dict[str, Any]]]
    frequency_penalty: NotRequired[Union[float, int]]
    logit_bias: NotRequired[Dict[str, Union[float, int]]]
    max_output_tokens: NotRequired[int]
    max_completions_tokens: NotRequired[int]
    meta: NotRequired[bool]
    presence_penalty: NotRequired[Union[float, int]]
    seed: NotRequired[int]
    stream: NotRequired[bool]
    temperature: NotRequired[Union[float, int]]
    tools: NotRequired[list[dict[str, Any]]]
    max_tool_calls: NotRequired[int]
    parallel_tool_calls: NotRequired[bool]
    tool_choice: NotRequired[Any]
    top_k: NotRequired[int]
    logprobs: NotRequired[bool]
    top_logprobs: NotRequired[int]
    top_p: NotRequired[Union[float, int]]
    usage: NotRequired[bool]


class AIStats:
    def __init__(self, api_key: str, base_url: Optional[str] = None, timeout: Optional[float] = None):
        if not api_key:
            raise ValueError("api_key is required")

        host = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self._base_url = host
        self._headers = {"Authorization": f"Bearer {api_key}", "User-Agent": DEFAULT_USER_AGENT}
        config = Configuration(host=host, access_token=api_key)
        self._client = ApiClient(configuration=config)
        self._api = DefaultApi(self._client)
        self._timeout = timeout
        self.chat = _ChatResource(self)
        self.responses = _ResponsesResource(self)
        self.messages = _MessagesResource(self)
        self.images = _ImagesResource(self)
        self.audio = _AudioResource(self)
        self.moderations = _ModerationsResource(self)
        self.batches = _BatchesResource(self)
        self.files = _FilesResource(self)
        self.models = _ModelsResource(self)
        self._coming_soon_message = "This endpoint is not yet supported in the SDK."

    def _coming_soon(self, endpoint: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "status": "coming_soon",
            "endpoint": endpoint,
            "message": self._coming_soon_message,
            "payload": payload or {},
        }

    def generate_text(self, request: models.ChatCompletionsRequest | ChatCompletionsParams) -> dict[str, Any]:
        payload = dict(request)
        payload["stream"] = False
        return self._api.create_chat_completion(_coerce_model(models.ChatCompletionsRequest, payload))

    def stream_text(self, request: models.ChatCompletionsRequest | ChatCompletionsParams) -> Iterator[str]:
        payload = dict(request)
        payload["stream"] = True
        client_timeout = self._timeout
        with httpx.stream(
            "POST",
            f"{self._base_url}/chat/completions",
            headers={**self._headers, "Content-Type": "application/json"},
            json=payload,
            timeout=client_timeout,
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                yield line.decode("utf-8") if isinstance(line, (bytes, bytearray)) else str(line)

    def generate_image(self, request: models.ImagesGenerationRequest) -> dict[str, Any]:
        return self._coming_soon("images/generations", dict(request))

    def generate_image_edit(self, request: models.ImagesEditRequest) -> dict[str, Any]:
        return self._coming_soon("images/edits", dict(request))

    def generate_embedding(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._api.create_embedding(_coerce_model(models.EmbeddingsRequest, body))

    def generate_moderation(self, request: models.ModerationsRequest) -> dict[str, Any]:
        return self._api.create_moderation(_coerce_model(models.ModerationsRequest, request))

    def generate_video(self, request: models.VideoGenerationRequest) -> dict[str, Any]:
        return self._coming_soon("videos", dict(request))

    def generate_transcription(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._coming_soon("audio/transcriptions", dict(body))

    def generate_translation(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._coming_soon("audio/translations", dict(body))

    def generate_speech(self, body: models.AudioSpeechRequest) -> dict[str, Any]:
        return self._coming_soon("audio/speech", dict(body))

    def generate_response(self, request: models.ResponsesRequest) -> dict[str, Any]:
        return self._api.create_response(_coerce_model(models.ResponsesRequest, dict(request)))

    def stream_response(self, request: models.ResponsesRequest) -> Iterator[str]:
        payload = dict(request)
        payload["stream"] = True
        with httpx.stream(
            "POST",
            f"{self._base_url}/responses",
            headers={**self._headers, "Content-Type": "application/json"},
            json=payload,
            timeout=self._timeout,
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                yield line.decode("utf-8") if isinstance(line, (bytes, bytearray)) else str(line)

    def generate_message(self, request: models.AnthropicMessagesRequest) -> dict[str, Any]:
        return self._api.create_anthropic_message(_coerce_model(models.AnthropicMessagesRequest, dict(request)))

    def stream_messages(self, request: models.AnthropicMessagesRequest) -> Iterator[str]:
        payload = dict(request)
        payload["stream"] = True
        with httpx.stream(
            "POST",
            f"{self._base_url}/messages",
            headers={**self._headers, "Content-Type": "application/json"},
            json=payload,
            timeout=self._timeout,
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                yield line.decode("utf-8") if isinstance(line, (bytes, bytearray)) else str(line)

    def create_batch(self, request: models.BatchRequest | dict[str, Any]) -> dict[str, Any]:
        payload = request if isinstance(request, dict) else dict(request)
        return self._api.create_batch(_coerce_model(models.BatchRequest, payload))

    def get_batch(self, batch_id: str) -> dict[str, Any]:
        return self._coming_soon("batches/{batch_id}", {"batch_id": batch_id})

    def list_files(self) -> dict[str, Any]:
        return self._api.list_files()

    def get_file(self, file_id: str) -> dict[str, Any]:
        return self._coming_soon("files/{file_id}", {"file_id": file_id})

    def upload_file(self, *, purpose: Optional[str] = None, file: Any = None) -> dict[str, Any]:
        return self._api.upload_file(purpose=purpose, file=file)

    def get_models(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._api.list_models(**(params or {}))

    def get_health(self) -> dict[str, Any]:
        return self._api.health()

    def get_generation(self, generation_id: str) -> dict[str, Any]:
        return self._api.get_generation(generation_id)

    def list_providers(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._api.list_providers(**(params or {}))

    def get_credits(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._api.get_credits(**(params or {}))

    def get_activity(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._api.get_activity(**(params or {}))

    def get_analytics(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._api.get_analytics(**(params or {}))

    def list_provisioning_keys(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._api.list_provisioning_keys(**(params or {}))

    def create_provisioning_key(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._api.create_provisioning_key(_coerce_model(models.CreateProvisioningKeyRequest, body))

    def get_provisioning_key(self, key_id: str) -> dict[str, Any]:
        return self._api.get_provisioning_key(key_id)

    def update_provisioning_key(self, key_id: str, body: dict[str, Any]) -> dict[str, Any]:
        return self._api.update_provisioning_key(
            key_id, _coerce_model(models.UpdateProvisioningKeyRequest, body)
        )

    def delete_provisioning_key(self, key_id: str) -> dict[str, Any]:
        return self._api.delete_provisioning_key(key_id)


__all__ = [
    "AIStats",
    "ChatCompletionsParams",
    "models",
]
