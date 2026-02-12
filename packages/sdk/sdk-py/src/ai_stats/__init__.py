from __future__ import annotations

from typing import Any, Dict, Iterator, Optional, Union
from typing_extensions import NotRequired, TypedDict

import httpx
import time

from gen.client import Client
from gen import models
from gen import operations as ops
from ai_stats_devtools import TelemetryRecorder, create_ai_stats_devtools

DEFAULT_BASE_URL = "https://api.phaseo.app/v1"
DEFAULT_USER_AGENT = "ai-stats-python"


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
    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        devtools: Optional[dict[str, Any]] = None,
    ):
        if not api_key:
            raise ValueError("api_key is required")

        host = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self._base_url = host
        self._headers = {"Authorization": f"Bearer {api_key}", "User-Agent": DEFAULT_USER_AGENT}
        self._client = Client(base_url=host, headers=self._headers)
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
        self._devtools = TelemetryRecorder(devtools)

    def _capture_success(
        self,
        *,
        endpoint: str,
        request: dict[str, Any],
        response: Any,
        started_at: float,
        stream: bool = False,
        chunk_count: Optional[int] = None,
        status_code: Optional[int] = None,
    ) -> None:
        self._devtools.capture_success(
            endpoint=endpoint,
            request=request,
            response=response,
            duration_ms=(time.time() - started_at) * 1000,
            stream=stream,
            chunk_count=chunk_count,
            status_code=status_code,
        )

    def _capture_error(
        self,
        *,
        endpoint: str,
        request: dict[str, Any],
        error: Exception,
        started_at: float,
        stream: bool = False,
        chunk_count: Optional[int] = None,
        status_code: Optional[int] = None,
    ) -> None:
        self._devtools.capture_error(
            endpoint=endpoint,
            request=request,
            error=error,
            duration_ms=(time.time() - started_at) * 1000,
            stream=stream,
            chunk_count=chunk_count,
            status_code=status_code,
        )

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
        started = time.time()
        try:
            response = ops.createChatCompletion(self._client, body=payload)
            self._capture_success(
                endpoint="chat.completions",
                request=payload,
                response=response,
                started_at=started,
            )
            return response
        except Exception as exc:
            self._capture_error(
                endpoint="chat.completions",
                request=payload,
                error=exc,
                started_at=started,
            )
            raise

    def stream_text(self, request: models.ChatCompletionsRequest | ChatCompletionsParams) -> Iterator[str]:
        payload = dict(request)
        payload["stream"] = True
        client_timeout = self._timeout
        started = time.time()
        chunk_count = 0
        status_code: Optional[int] = None
        try:
            with httpx.stream(
                "POST",
                f"{self._base_url}/chat/completions",
                headers={**self._headers, "Content-Type": "application/json"},
                json=payload,
                timeout=client_timeout,
            ) as resp:
                status_code = resp.status_code
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line:
                        continue
                    chunk_count += 1
                    yield line.decode("utf-8") if isinstance(line, (bytes, bytearray)) else str(line)
            self._capture_success(
                endpoint="chat.completions",
                request=payload,
                response={"chunks": chunk_count},
                started_at=started,
                stream=True,
                chunk_count=chunk_count,
                status_code=status_code,
            )
        except Exception as exc:
            self._capture_error(
                endpoint="chat.completions",
                request=payload,
                error=exc,
                started_at=started,
                stream=True,
                chunk_count=chunk_count,
                status_code=status_code,
            )
            raise

    def generate_image(self, request: models.ImagesGenerationRequest) -> dict[str, Any]:
        return self._coming_soon("images/generations", dict(request))

    def generate_image_edit(self, request: models.ImagesEditRequest) -> dict[str, Any]:
        return self._coming_soon("images/edits", dict(request))

    def generate_embedding(self, body: dict[str, Any]) -> dict[str, Any]:
        payload = dict(body)
        started = time.time()
        try:
            response = ops.createEmbedding(self._client, body=payload)
            self._capture_success(
                endpoint="embeddings",
                request=payload,
                response=response,
                started_at=started,
            )
            return response
        except Exception as exc:
            self._capture_error(
                endpoint="embeddings",
                request=payload,
                error=exc,
                started_at=started,
            )
            raise

    def generate_moderation(self, request: models.ModerationsRequest) -> dict[str, Any]:
        payload = dict(request)
        started = time.time()
        try:
            response = ops.createModeration(self._client, body=payload)
            self._capture_success(
                endpoint="moderations",
                request=payload,
                response=response,
                started_at=started,
            )
            return response
        except Exception as exc:
            self._capture_error(
                endpoint="moderations",
                request=payload,
                error=exc,
                started_at=started,
            )
            raise

    def generate_video(self, request: models.VideoGenerationRequest) -> dict[str, Any]:
        return self._coming_soon("videos", dict(request))

    def generate_transcription(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._coming_soon("audio/transcriptions", dict(body))

    def generate_translation(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._coming_soon("audio/translations", dict(body))

    def generate_speech(self, body: models.AudioSpeechRequest) -> dict[str, Any]:
        return self._coming_soon("audio/speech", dict(body))

    def generate_response(self, request: models.ResponsesRequest) -> dict[str, Any]:
        payload = dict(request)
        started = time.time()
        try:
            response = ops.createResponse(self._client, body=payload)
            self._capture_success(
                endpoint="responses",
                request=payload,
                response=response,
                started_at=started,
            )
            return response
        except Exception as exc:
            self._capture_error(
                endpoint="responses",
                request=payload,
                error=exc,
                started_at=started,
            )
            raise

    def stream_response(self, request: models.ResponsesRequest) -> Iterator[str]:
        payload = dict(request)
        payload["stream"] = True
        started = time.time()
        chunk_count = 0
        status_code: Optional[int] = None
        try:
            with httpx.stream(
                "POST",
                f"{self._base_url}/responses",
                headers={**self._headers, "Content-Type": "application/json"},
                json=payload,
                timeout=self._timeout,
            ) as resp:
                status_code = resp.status_code
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line:
                        continue
                    chunk_count += 1
                    yield line.decode("utf-8") if isinstance(line, (bytes, bytearray)) else str(line)
            self._capture_success(
                endpoint="responses",
                request=payload,
                response={"chunks": chunk_count},
                started_at=started,
                stream=True,
                chunk_count=chunk_count,
                status_code=status_code,
            )
        except Exception as exc:
            self._capture_error(
                endpoint="responses",
                request=payload,
                error=exc,
                started_at=started,
                stream=True,
                chunk_count=chunk_count,
                status_code=status_code,
            )
            raise

    def generate_message(self, request: models.AnthropicMessagesRequest) -> dict[str, Any]:
        payload = dict(request)
        started = time.time()
        try:
            response = ops.createAnthropicMessage(self._client, body=payload)
            self._capture_success(
                endpoint="messages",
                request=payload,
                response=response,
                started_at=started,
            )
            return response
        except Exception as exc:
            self._capture_error(
                endpoint="messages",
                request=payload,
                error=exc,
                started_at=started,
            )
            raise

    def stream_messages(self, request: models.AnthropicMessagesRequest) -> Iterator[str]:
        payload = dict(request)
        payload["stream"] = True
        started = time.time()
        chunk_count = 0
        status_code: Optional[int] = None
        try:
            with httpx.stream(
                "POST",
                f"{self._base_url}/messages",
                headers={**self._headers, "Content-Type": "application/json"},
                json=payload,
                timeout=self._timeout,
            ) as resp:
                status_code = resp.status_code
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line:
                        continue
                    chunk_count += 1
                    yield line.decode("utf-8") if isinstance(line, (bytes, bytearray)) else str(line)
            self._capture_success(
                endpoint="messages",
                request=payload,
                response={"chunks": chunk_count},
                started_at=started,
                stream=True,
                chunk_count=chunk_count,
                status_code=status_code,
            )
        except Exception as exc:
            self._capture_error(
                endpoint="messages",
                request=payload,
                error=exc,
                started_at=started,
                stream=True,
                chunk_count=chunk_count,
                status_code=status_code,
            )
            raise

    def create_batch(self, request: models.BatchRequest | dict[str, Any]) -> dict[str, Any]:
        payload = request if isinstance(request, dict) else dict(request)
        return self._coming_soon("batches", payload)

    def get_batch(self, batch_id: str) -> dict[str, Any]:
        return self._coming_soon("batches/{batch_id}", {"batch_id": batch_id})

    def list_files(self) -> dict[str, Any]:
        return self._coming_soon("files", {})

    def get_file(self, file_id: str) -> dict[str, Any]:
        return self._coming_soon("files/{file_id}", {"file_id": file_id})

    def upload_file(self, *, purpose: Optional[str] = None, file: Any = None) -> dict[str, Any]:
        return self._coming_soon("files", {"purpose": purpose})

    def get_models(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return ops.listModels(self._client, query=params or {})

    def get_health(self) -> dict[str, Any]:
        return ops.health(self._client)

    def get_generation(self, generation_id: str) -> dict[str, Any]:
        return self._coming_soon("generation", {"id": generation_id})

    def list_providers(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return ops.listProviders(self._client, query=params or {})

    def get_credits(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return ops.getCredits(self._client, query=params or {})

    def get_activity(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return ops.getActivity(self._client, query=params or {})

    def get_analytics(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return ops.getAnalytics(self._client, query=params or {})

    def list_provisioning_keys(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return ops.listProvisioningKeys(self._client, query=params or {})

    def create_provisioning_key(self, body: dict[str, Any]) -> dict[str, Any]:
        return ops.createProvisioningKey(self._client, body=body)

    def get_provisioning_key(self, key_id: str) -> dict[str, Any]:
        return ops.getProvisioningKey(self._client, path={"id": key_id})

    def update_provisioning_key(self, key_id: str, body: dict[str, Any]) -> dict[str, Any]:
        return ops.updateProvisioningKey(self._client, path={"id": key_id}, body=body)

    def delete_provisioning_key(self, key_id: str) -> dict[str, Any]:
        return ops.deleteProvisioningKey(self._client, path={"id": key_id})


__all__ = [
    "AIStats",
    "ChatCompletionsParams",
    "create_ai_stats_devtools",
    "models",
]
