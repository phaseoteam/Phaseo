from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Dict, Iterator, Literal, Optional, TypeAlias, Union
from typing_extensions import NotRequired, TypedDict

import httpx
import os
import time
import warnings

from gen.client import Client
from gen import models
from gen import operations as ops
from ai_stats_devtools import TelemetryRecorder, create_ai_stats_devtools
from .model_ids import MODEL_IDS, ModelIds

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

    def get_deprecation_info(self, model_id: str) -> Optional[ModelLifecycleInfo]:
        return self._parent.get_model_deprecation_info(model_id)

    def validate(self, model_id: str) -> dict[str, Any]:
        return self._parent.validate_model(model_id)


class _VideosResource:
    def __init__(self, parent: "AIStats"):
        self._parent = parent

    def create(self, params: dict[str, Any]) -> dict[str, Any]:
        return self._parent.generate_video(params)

    def retrieve(self, video_id: str) -> dict[str, Any]:
        return self._parent.get_video(video_id)

    def content(self, video_id: str) -> bytes:
        return self._parent.get_video_content(video_id)

    def download_url(self, video_id: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._parent.get_video_download_url(video_id, params)

    def cancel(self, video_id: str) -> dict[str, Any]:
        return self._parent.cancel_video(video_id)

    def delete(self, video_id: str) -> dict[str, Any]:
        return self._parent.delete_video(video_id)

    def list_models(self) -> dict[str, Any]:
        return self._parent.list_video_models()


KnownModelId: TypeAlias = models.KnownModelId
ModelId: TypeAlias = Union[KnownModelId, str]
AIStatsLogLevel: TypeAlias = Literal["info", "warn", "error"]
AIStatsLogger: TypeAlias = Callable[[AIStatsLogLevel, str, dict[str, Any]], None]


class ModelLifecycleInfo(TypedDict):
    model_id: str
    status: Literal["active", "deprecated", "retired"]
    source_status: Optional[str]
    deprecation_date: Optional[str]
    retirement_date: Optional[str]
    replacement_model_id: Optional[str]
    message: Optional[str]


class ChatCompletionsParams(TypedDict, total=False):
    model: ModelId
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


class VideoInputReference(TypedDict, total=False):
    type: Literal["image", "video", "mask"]
    role: Literal["first_frame", "last_frame", "reference", "source", "mask"]
    reference_type: str
    url: str
    data: str
    mime_type: str
    asset_id: str


class VideoCreateRequest(TypedDict, total=False):
    model: ModelId
    prompt: str
    duration_seconds: int
    size: str
    resolution: str
    aspect_ratio: str
    seed: int
    sample_count: int
    negative_prompt: str
    generate_audio: bool
    enhance_prompt: bool
    compression_quality: int
    person_generation: str
    resize_mode: str
    input_references: list[VideoInputReference]
    provider_params: dict[str, Any]
    output: dict[str, Any]
    webhook: dict[str, Any]
    provider: dict[str, Any]
    debug: dict[str, Any]
    beta: dict[str, Any]


class AIStats:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        devtools: Optional[dict[str, Any]] = None,
        enable_deprecation_warnings: bool = True,
        warnings_as_errors: bool = False,
        logger: Optional[AIStatsLogger] = None,
    ):
        api_key = api_key or os.getenv("AI_STATS_API_KEY")
        if not api_key:
            raise ValueError("api_key is required (pass api_key or set AI_STATS_API_KEY)")

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
        self.videos = _VideosResource(self)
        self._coming_soon_message = "This endpoint is not yet supported in the SDK."
        self._devtools = TelemetryRecorder(devtools)
        self._enable_deprecation_warnings = enable_deprecation_warnings
        self._warnings_as_errors = warnings_as_errors
        self._logger = logger
        self._warned_models: set[str] = set()
        self._model_lifecycle_cache: dict[str, Optional[ModelLifecycleInfo]] = {}

    @property
    def raw_client(self) -> Client:
        return self._client

    def request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[dict[str, Any]] = None,
        headers: Optional[dict[str, str]] = None,
        body: Optional[Any] = None,
    ) -> dict[str, Any]:
        return self._client.request(method, path, query=query, headers=headers, body=body)

    def get_model_deprecation_info(self, model_id: str) -> Optional[ModelLifecycleInfo]:
        normalized_model_id = _as_trimmed_string(model_id)
        if not normalized_model_id:
            return None
        return self._resolve_model_lifecycle(normalized_model_id)

    def validate_model(self, model_id: str) -> dict[str, Any]:
        info = self.get_model_deprecation_info(model_id)
        if not info:
            return {"ok": True, "info": None}
        if not _is_model_requestable_for_inference(info):
            return {"ok": False, "info": info, "reason": _build_inactive_model_request_message(info)}
        return {"ok": True, "info": info}

    def _maybe_warn_for_payload(self, payload: dict[str, Any] | None) -> None:
        model_id = _extract_model_id_from_payload(payload)
        if not model_id:
            return
        self._ensure_model_requestable(model_id)
        self._maybe_warn_for_model(model_id)

    def _ensure_model_requestable(self, model_id: str) -> None:
        normalized_model_id = _as_trimmed_string(model_id)
        if not normalized_model_id:
            return
        lifecycle = self._resolve_model_lifecycle(normalized_model_id)
        if not lifecycle:
            return
        if _is_model_requestable_for_inference(lifecycle):
            return
        raise ValueError(_build_inactive_model_request_message(lifecycle))

    def _maybe_warn_for_model(self, model_id: str) -> None:
        if not self._enable_deprecation_warnings:
            return
        normalized_model_id = _as_trimmed_string(model_id)
        if not normalized_model_id:
            return
        lifecycle = self._resolve_model_lifecycle(normalized_model_id)
        if not lifecycle or lifecycle["status"] == "active":
            return

        message = lifecycle.get("message") or _build_lifecycle_message(
            lifecycle["status"],
            lifecycle["model_id"],
            lifecycle.get("deprecation_date"),
            lifecycle.get("retirement_date"),
            lifecycle.get("replacement_model_id"),
        )
        if not message:
            return

        if self._warnings_as_errors:
            raise ValueError(message)

        if normalized_model_id in self._warned_models:
            return
        self._warned_models.add(normalized_model_id)

        if self._logger:
            self._logger("warn", message, dict(lifecycle))
            return
        warnings.warn(message, UserWarning, stacklevel=3)

    def _resolve_model_lifecycle(self, model_id: str) -> Optional[ModelLifecycleInfo]:
        if model_id in self._model_lifecycle_cache:
            return self._model_lifecycle_cache[model_id]

        try:
            payload = self.request(
                "GET",
                "/data/models",
                query={"model_id": model_id, "limit": 1},
            )
        except Exception:
            self._model_lifecycle_cache[model_id] = None
            return None

        rows = payload.get("models")
        if not isinstance(rows, list):
            self._model_lifecycle_cache[model_id] = None
            return None

        model_row = None
        for row in rows:
            if not isinstance(row, dict):
                continue
            row_model_id = _as_trimmed_string(row.get("model_id"))
            if row_model_id == model_id:
                model_row = row
                break

        if not model_row:
            self._model_lifecycle_cache[model_id] = None
            return None

        lifecycle = _to_model_lifecycle_info(model_row, model_id)
        self._model_lifecycle_cache[model_id] = lifecycle
        return lifecycle

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
        self._maybe_warn_for_payload(payload)
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
        self._maybe_warn_for_payload(payload)
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
        payload = dict(request)
        self._maybe_warn_for_payload(payload)
        return ops.createImage(self._client, body=payload)

    def generate_image_edit(self, request: models.ImagesEditRequest) -> dict[str, Any]:
        payload = dict(request)
        self._maybe_warn_for_payload(payload)
        return ops.createImageEdit(self._client, body=payload)

    def generate_embedding(self, body: dict[str, Any]) -> dict[str, Any]:
        payload = dict(body)
        self._maybe_warn_for_payload(payload)
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
        self._maybe_warn_for_payload(payload)
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

    def generate_video(self, request: VideoCreateRequest | dict[str, Any]) -> dict[str, Any]:
        payload = dict(request)
        self._maybe_warn_for_payload(payload)
        return ops.createVideo(self._client, body=payload)

    def get_video(self, video_id: str) -> dict[str, Any]:
        return ops.getVideo(self._client, path={"video_id": video_id})

    def get_video_content(self, video_id: str) -> bytes:
        url = f"{self._base_url}/videos/{video_id}/content"
        response = httpx.get(url, headers=self._headers, timeout=self._timeout)
        response.raise_for_status()
        return response.content

    def get_video_download_url(self, video_id: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self.request("POST", f"/videos/{video_id}/download_url", body=params or {})

    def cancel_video(self, video_id: str) -> dict[str, Any]:
        return self.request("POST", f"/videos/{video_id}/cancel")

    def delete_video(self, video_id: str) -> dict[str, Any]:
        return ops.deleteVideo(self._client, path={"video_id": video_id})

    def list_video_models(self) -> dict[str, Any]:
        return self.request("GET", "/videos/models")

    def generate_transcription(self, body: dict[str, Any]) -> dict[str, Any]:
        payload = dict(body)
        self._maybe_warn_for_payload(payload)
        return ops.createTranscription(self._client, body=payload)

    def generate_translation(self, body: dict[str, Any]) -> dict[str, Any]:
        payload = dict(body)
        self._maybe_warn_for_payload(payload)
        return ops.createTranslation(self._client, body=payload)

    def generate_speech(self, body: models.AudioSpeechRequest) -> dict[str, Any]:
        payload = dict(body)
        self._maybe_warn_for_payload(payload)
        return ops.createSpeech(self._client, body=payload)

    def generate_response(self, request: models.ResponsesRequest) -> dict[str, Any]:
        payload = dict(request)
        self._maybe_warn_for_payload(payload)
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
        self._maybe_warn_for_payload(payload)
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
        self._maybe_warn_for_payload(payload)
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
        self._maybe_warn_for_payload(payload)
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
        return ops.createBatch(self._client, body=payload)

    def get_batch(self, batch_id: str) -> dict[str, Any]:
        return ops.retrieveBatch(self._client, path={"batch_id": batch_id})

    def list_files(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return ops.listFiles(self._client, query=params or {})

    def get_file(self, file_id: str) -> dict[str, Any]:
        return ops.retrieveFile(self._client, path={"file_id": file_id})

    def upload_file(self, *, purpose: Optional[str] = None, file: Any = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"file": file}
        if purpose is not None:
            payload["purpose"] = purpose
        return ops.uploadFile(self._client, body=payload)

    def get_models(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return ops.listModels(self._client, query=params or {})

    def get_health(self) -> dict[str, Any]:
        return ops.healthz(self._client)

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


def _extract_model_id_from_payload(payload: dict[str, Any] | None) -> Optional[str]:
    if not isinstance(payload, dict):
        return None

    direct = _as_trimmed_string(payload.get("model")) or _as_trimmed_string(payload.get("model_id"))
    if direct:
        return direct

    for key in ("body", "payload", "request", "params"):
        nested = payload.get(key)
        if not isinstance(nested, dict):
            continue
        nested_model = _as_trimmed_string(nested.get("model")) or _as_trimmed_string(nested.get("model_id"))
        if nested_model:
            return nested_model

    return None


def _to_model_lifecycle_info(model: dict[str, Any], fallback_model_id: str) -> ModelLifecycleInfo:
    lifecycle_obj = model.get("lifecycle")
    lifecycle = lifecycle_obj if isinstance(lifecycle_obj, dict) else {}
    model_id = _as_trimmed_string(model.get("model_id")) or fallback_model_id
    source_status = _as_trimmed_string(model.get("status")) or _as_trimmed_string(lifecycle.get("status"))

    deprecation_date = _as_trimmed_string(lifecycle.get("deprecation_date")) or _as_trimmed_string(
        model.get("deprecation_date")
    )
    retirement_date = _as_trimmed_string(lifecycle.get("retirement_date")) or _as_trimmed_string(
        model.get("retirement_date")
    )
    status = _normalize_lifecycle_status(
        _as_trimmed_string(lifecycle.get("status")) or _as_trimmed_string(model.get("status")),
        deprecation_date,
        retirement_date,
    )
    replacement_model_id = _as_trimmed_string(lifecycle.get("replacement_model_id"))
    message = _as_trimmed_string(lifecycle.get("message")) or _build_lifecycle_message(
        status, model_id, deprecation_date, retirement_date, replacement_model_id
    )

    return {
        "model_id": model_id,
        "status": status,
        "source_status": source_status,
        "deprecation_date": deprecation_date,
        "retirement_date": retirement_date,
        "replacement_model_id": replacement_model_id,
        "message": message,
    }


def _normalize_lifecycle_status(
    status: Optional[str], deprecation_date: Optional[str], retirement_date: Optional[str]
) -> Literal["active", "deprecated", "retired"]:
    now = datetime.now(timezone.utc)

    retirement_dt = _parse_iso_datetime(retirement_date)
    if retirement_dt and retirement_dt <= now:
        return "retired"

    normalized = (status or "").strip().lower()
    if normalized == "retired":
        return "retired"

    deprecation_dt = _parse_iso_datetime(deprecation_date)
    if deprecation_dt and deprecation_dt <= now:
        return "deprecated"
    if normalized == "deprecated":
        return "deprecated"

    return "active"


def _build_lifecycle_message(
    status: Literal["active", "deprecated", "retired"],
    model_id: str,
    deprecation_date: Optional[str],
    retirement_date: Optional[str],
    replacement_model_id: Optional[str],
) -> Optional[str]:
    replacement = f' Use "{replacement_model_id}" instead.' if replacement_model_id else ""
    if status == "retired":
        if retirement_date:
            return f'[ai-stats] Model "{model_id}" is retired as of {retirement_date}.{replacement}'
        return f'[ai-stats] Model "{model_id}" is retired.{replacement}'
    if status == "deprecated":
        if retirement_date:
            return (
                f'[ai-stats] Model "{model_id}" is deprecated and scheduled for retirement on {retirement_date}.'
                f"{replacement}"
            )
        if deprecation_date:
            return f'[ai-stats] Model "{model_id}" has been deprecated since {deprecation_date}.{replacement}'
        return f'[ai-stats] Model "{model_id}" is deprecated.{replacement}'
    return None


_ACTIVE_MODEL_SOURCE_STATUSES = {"active", "available"}
_INACTIVE_MODEL_SOURCE_STATUSES = {
    "deprecated",
    "retired",
    "withheld",
    "announced",
    "rumoured",
    "rumored",
    "unavailable",
    "disabled",
    "internal",
    "private",
    "removed",
    "sunset",
    "eol",
    "end_of_life",
    "end-of-life",
}


def _normalize_source_status(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    normalized = value.strip().lower()
    return normalized or None


def _is_model_requestable_for_inference(info: ModelLifecycleInfo) -> bool:
    if info.get("status") != "active":
        return False
    source_status = _normalize_source_status(info.get("source_status"))
    if not source_status:
        return True
    if source_status in _ACTIVE_MODEL_SOURCE_STATUSES:
        return True
    if source_status in _INACTIVE_MODEL_SOURCE_STATUSES:
        return False
    return False


def _build_inactive_model_request_message(info: ModelLifecycleInfo) -> str:
    status = info.get("status")
    if status != "active":
        fallback = _build_lifecycle_message(
            status or "retired",
            info.get("model_id") or "unknown-model",
            info.get("deprecation_date"),
            info.get("retirement_date"),
            info.get("replacement_model_id"),
        )
        return info.get("message") or fallback or f'Model "{info.get("model_id")}" is not active for inference.'

    source_status = _normalize_source_status(info.get("source_status")) or "unknown"
    replacement = (
        f' Use "{info.get("replacement_model_id")}" instead.'
        if info.get("replacement_model_id")
        else ""
    )
    return (
        f'[ai-stats] Model "{info.get("model_id")}" is not active for inference '
        f"(status: {source_status}).{replacement}"
    )


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = f"{raw[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _as_trimmed_string(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


__all__ = [
    "AIStats",
    "AIStatsLogLevel",
    "AIStatsLogger",
    "ChatCompletionsParams",
    "KnownModelId",
    "MODEL_IDS",
    "ModelLifecycleInfo",
    "ModelIds",
    "ModelId",
    "create_ai_stats_devtools",
    "models",
    "ops",
]
