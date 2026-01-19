from __future__ import annotations

from typing import Any, Dict, Iterator, Optional, Union
from typing_extensions import NotRequired, TypedDict

import httpx

from gen.client import Client
from gen import models
from gen import operations as ops

DEFAULT_BASE_URL = "https://api.phaseo.app/v1"


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
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._client = Client(base_url=host, headers=self._headers)
        self._timeout = timeout

    def generate_text(self, request: models.ChatCompletionsRequest | ChatCompletionsParams) -> dict[str, Any]:
        payload = dict(request)
        payload["stream"] = False
        return ops.createChatCompletion(self._client, body=payload)

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
        return ops.createImage(self._client, body=request)

    def generate_image_edit(self, request: models.ImagesEditRequest) -> dict[str, Any]:
        form_data = {key: value for key, value in request.items() if value is not None}
        files = {}
        if "image" in form_data:
            files["image"] = form_data.pop("image")
        if "mask" in form_data and form_data["mask"] is not None:
            files["mask"] = form_data.pop("mask")
        resp = httpx.post(
            f"{self._base_url}/images/edits",
            headers=self._headers,
            data=form_data,
            files=files or None,
            timeout=self._timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def generate_embedding(self, body: dict[str, Any]) -> dict[str, Any]:
        return ops.createEmbedding(self._client, body=body)

    def generate_moderation(self, request: models.ModerationsRequest) -> dict[str, Any]:
        return ops.createModeration(self._client, body=request)

    def generate_video(self, request: models.VideoGenerationRequest) -> dict[str, Any]:
        return ops.createVideo(self._client, body=request)

    def generate_transcription(self, body: dict[str, Any]) -> dict[str, Any]:
        resp = httpx.post(
            f"{self._base_url}/audio/transcriptions",
            headers=self._headers,
            data=body,
            timeout=self._timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def generate_translation(self, body: dict[str, Any]) -> dict[str, Any]:
        resp = httpx.post(
            f"{self._base_url}/audio/translations",
            headers=self._headers,
            data=body,
            timeout=self._timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def generate_speech(self, body: models.AudioSpeechRequest) -> bytes:
        resp = httpx.post(
            f"{self._base_url}/audio/speech",
            headers={**self._headers, "Content-Type": "application/json"},
            json=body,
            timeout=self._timeout,
        )
        resp.raise_for_status()
        return resp.content

    def generate_response(self, request: models.ResponsesRequest) -> dict[str, Any]:
        return ops.createResponse(self._client, body=request)

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

    def create_batch(self, request: models.BatchRequest | dict[str, Any]) -> dict[str, Any]:
        payload = request if isinstance(request, dict) else dict(request)
        return ops.createBatch(self._client, body=payload)

    def get_batch(self, batch_id: str) -> dict[str, Any]:
        return ops.retrieveBatch(self._client, path={"batch_id": batch_id})

    def list_files(self) -> dict[str, Any]:
        return ops.listFiles(self._client)

    def get_file(self, file_id: str) -> dict[str, Any]:
        return ops.retrieveFile(self._client, path={"file_id": file_id})

    def upload_file(self, *, purpose: Optional[str] = None, file: Any = None) -> dict[str, Any]:
        if file is None:
            raise ValueError("file is required")
        files = {"file": file}
        data = {"purpose": purpose} if purpose else None
        resp = httpx.post(
            f"{self._base_url}/files",
            headers=self._headers,
            files=files,
            data=data,
            timeout=self._timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def get_models(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return ops.listModels(self._client, query=params or {})

    def get_health(self) -> dict[str, Any]:
        return ops.healthz(self._client)

    def get_generation(self, generation_id: str) -> dict[str, Any]:
        return ops.getGeneration(self._client, query={"id": generation_id})


__all__ = [
    "AIStats",
    "ChatCompletionsParams",
    "models",
]
