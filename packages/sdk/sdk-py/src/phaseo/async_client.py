"""Native asyncio client using HTTPX; no worker threads or blocking polling."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, aclosing, ExitStack
import inspect
import json
import os
import time
from typing import Any, AsyncIterator, Callable, TypeVar
from pydantic import BaseModel
from urllib.parse import quote

import httpx

from .helpers import check_capabilities, check_parameter_support, parse_output, _batch_line, _accumulate_event
from .jobs import JobFailedError, JobTimeoutError, job_status, _validate_options
from .transport import APIResponse, PhaseoHTTPError, RawResponse, RequestHook, decode_response, request_trace_url, retry_after, validate_controls
from .media import upload_input

ParsedOutput = TypeVar("ParsedOutput", bound=BaseModel)


class AsyncResource:
    def __init__(self, client: "AsyncPhaseo", path: str):
        self.client, self.path = client, path

    async def create(self, params: dict[str, Any]) -> APIResponse:
        return await self.client.request("POST", self.path, body=params)

    async def list(self, params: dict[str, Any] | None = None) -> APIResponse:
        return await self.client.request("GET", self.path, query=params)

    async def retrieve(self, resource_id: str) -> APIResponse:
        return await self.client.request("GET", f"{self.path}/{quote(resource_id, safe='')}")

    get = retrieve


class AsyncTextResource(AsyncResource):
    async def create(self, params: dict[str, Any]) -> Any:
        if params.get("stream"):
            return self.stream(params)
        return await super().create(params)

    async def parse(self, params: dict[str, Any], schema: type[ParsedOutput]) -> ParsedOutput:
        if params.get("stream"):
            raise ValueError("parse requires a completed response; use stream for streaming")
        return parse_output(await self.create(params), schema)

    async def stream(self, params: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        from . import _parse_chat_stream_line, _parse_response_stream_line, _parse_message_stream_line
        parser = {"/responses": _parse_response_stream_line, "/messages": _parse_message_stream_line}.get(self.path, _parse_chat_stream_line)
        async with self.client._stream("POST", self.path, json={**params, "stream": True}) as response:
            async for line in response.aiter_lines():
                event = parser(line)
                if event is not None:
                    yield event


class AsyncChat:
    def __init__(self, client: "AsyncPhaseo"):
        self.completions = AsyncTextResource(client, "/chat/completions")


class AsyncModels(AsyncResource):
    async def capabilities(self, model_id: str, params: dict[str, Any] | None = None) -> APIResponse:
        return await self.client.get_model_endpoint_capabilities(model_id, params)

    async def check_parameters(
        self,
        model_id: str,
        parameter_values: dict[str, Any],
        *,
        endpoint: str | None = None,
        provider: str | list[str] | None = None,
    ) -> dict[str, Any]:
        return await self.client.check_model_parameters(
            model_id,
            parameter_values,
            endpoint=endpoint,
            provider=provider,
        )


class AsyncImages(AsyncResource):
    async def generate(self, params: dict[str, Any]) -> APIResponse:
        return await self.client.request("POST", "/images/generations", body=params)

    async def edit(self, params: dict[str, Any]) -> APIResponse:
        with ExitStack() as stack:
            fields = []
            for name, value in params.items():
                if value is None:
                    continue
                if name in ("image", "mask"):
                    for item in value if isinstance(value, list) else [value]:
                        upload = (None, item) if isinstance(item, str) else stack.enter_context(upload_input(item, name))
                        fields.append((name, upload))
                else:
                    fields.append((name, (None, value if isinstance(value, str) else json.dumps(value))))
            async with self.client._stream("POST", "/images/edits", files=fields) as response:
                await response.aread()
                return decode_response(response)


class AsyncAudio:
    def __init__(self, client: "AsyncPhaseo"):
        self.speech = AsyncSpeech(client, "/audio/speech")
        self.transcriptions = AsyncResource(client, "/audio/transcriptions")
        self.translations = AsyncResource(client, "/audio/translations")


class AsyncSpeech:
    def __init__(self, client: "AsyncPhaseo", path: str):
        self.client, self.path = client, path

    async def create(self, params: dict[str, Any]) -> bytes:
        async with self.client._stream("POST", self.path, json=params) as response:
            return await response.aread()


class AsyncDecisions(AsyncResource):
    make = AsyncResource.create


class AsyncFiles(AsyncResource):
    async def create(self, params: dict[str, Any]) -> APIResponse:
        with upload_input(params["file"], params.get("filename", "upload"), params.get("content_type", "application/octet-stream")) as file:
            async with self.client._stream("POST", self.path, files={"file": file}, data={"purpose": params["purpose"]} if params.get("purpose") else {}) as response:
                await response.aread()
                return decode_response(response)

    async def content(self, file_id: str) -> bytes:
        async with self.client._stream("GET", f"{self.path}/{quote(file_id, safe='')}/content") as response:
            return await response.aread()

    async def stream_content(self, file_id: str) -> AsyncIterator[bytes]:
        async with aclosing(self.client.stream_content(f"{self.path}/{quote(file_id, safe='')}/content")) as source:
            async for chunk in source:
                yield chunk


class AsyncJobHandle:
    def __init__(self, resource: "AsyncJobs", job_id: str, initial: dict[str, Any] | None = None):
        if not job_id.strip():
            raise ValueError("Job ID is required")
        self.resource, self.id, self.initial = resource, job_id, initial
        self.kind = resource.kind

    def to_dict(self) -> dict[str, str]:
        return {"kind": self.kind, "id": self.id}

    async def result(self, **options: Any) -> APIResponse:
        response = await self.resource.wait(self.id, _initial=self.initial, **options)
        if job_status(response) != "completed":
            raise JobFailedError(self.kind, response)
        return response

    async def cancel(self) -> APIResponse:
        return await self.resource.cancel(self.id)

    async def events(self, *, interval: float = 5, timeout: float = 1800) -> AsyncIterator[dict[str, Any]]:
        _validate_options({"interval": interval, "timeout": timeout})
        deadline = time.monotonic() + timeout
        last = self.initial
        initial = self.initial
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise JobTimeoutError(self.kind, self.id, last)
            try:
                last = initial or await asyncio.wait_for(self.resource.retrieve(self.id), remaining)
            except asyncio.TimeoutError as error:
                raise JobTimeoutError(self.kind, self.id, last) from error
            initial = None
            yield last
            if job_status(last) in ("completed", "failed", "cancelled", "expired"):
                return
            await asyncio.sleep(min(max(.25, interval), max(0, deadline - time.monotonic())))


class AsyncJobs(AsyncResource):
    def __init__(self, client: "AsyncPhaseo", path: str, kind: str):
        super().__init__(client, path)
        self.kind = kind

    async def start(self, params: dict[str, Any]) -> AsyncJobHandle:
        initial = await self.create(params)
        return AsyncJobHandle(self, initial["id"], initial)

    def resume(self, job_id: str) -> AsyncJobHandle:
        return AsyncJobHandle(self, job_id)

    async def wait(self, job_id: str, *, interval: float = 5, timeout: float = 1800, on_poll: Callable[..., Any] | None = None, _initial: dict[str, Any] | None = None) -> APIResponse:
        last = None
        async def run() -> APIResponse:
            nonlocal last
            async for event in AsyncJobHandle(self, job_id, _initial).events(interval=interval, timeout=timeout):
                last = event
                if on_poll:
                    result = on_poll(event)
                    if inspect.isawaitable(result):
                        await result
            return last
        _validate_options({"interval": interval, "timeout": timeout})
        try:
            return await asyncio.wait_for(run(), timeout)
        except asyncio.TimeoutError as error:
            raise JobTimeoutError(self.kind, job_id, last) from error

    async def generate_and_wait(self, params: dict[str, Any], *, interval: float = 5, timeout: float = 1800, on_poll: Callable[..., Any] | None = None) -> APIResponse:
        _validate_options({"interval": interval, "timeout": timeout})
        return await (await self.start(params)).result(interval=interval, timeout=timeout, on_poll=on_poll)

    create_and_wait = generate_and_wait

    async def cancel(self, job_id: str) -> APIResponse:
        if self.kind == "music":
            raise NotImplementedError("Remote cancellation is not supported for music")
        return await self.client.request("POST", f"{self.path}/{quote(job_id, safe='')}/cancel")

    async def stream_content(self, job_id: str) -> AsyncIterator[bytes]:
        if self.kind != "video":
            raise NotImplementedError("Use batch results or the returned music asset URL")
        async with aclosing(self.client.stream_content(f"{self.path}/{quote(job_id, safe='')}/content")) as source:
            async for chunk in source:
                yield chunk

    async def stream_results(self, job_id: str) -> AsyncIterator[bytes]:
        if self.kind != "batch":
            raise NotImplementedError("stream_results requires a batch")
        async with aclosing(self.client.stream_content(f"{self.path}/{quote(job_id, safe='')}/results")) as source:
            async for chunk in source:
                yield chunk

    async def results(self, job_id: str) -> AsyncIterator[dict[str, Any]]:
        pending = b""
        async with aclosing(self.stream_results(job_id)) as source:
            async for chunk in source:
                pending += chunk
                while b"\n" in pending:
                    line, pending = pending.split(b"\n", 1)
                    if len(line) > 10 * 1024 * 1024:
                        raise ValueError("Batch result line exceeds size limit")
                    if line.strip():
                        yield _batch_line(line)
                if len(pending) > 10 * 1024 * 1024:
                    raise ValueError("Batch result line exceeds size limit")
        if pending.strip():
            yield _batch_line(pending)


class AsyncPhaseo:
    def __init__(self, api_key: str | None = None, base_url: str | None = None, *, region: str | None = None,
                 timeout: float = 60, max_retries: int = 0, http_client: httpx.AsyncClient | None = None,
                 headers: dict[str, str] | None = None, app: dict[str, str] | None = None,
                 client_source: str | None = None, client_source_version: str | None = None,
                 on_request: RequestHook | None = None, on_response: RequestHook | None = None,
                 on_retry: RequestHook | None = None):
        from . import REGIONAL_BASE_URLS, DEFAULT_USER_AGENT
        key = api_key or os.getenv("PHASEO_API_KEY")
        if not key:
            raise ValueError("api_key is required")
        if base_url is not None and region is not None:
            raise ValueError("base_url and region cannot be used together")
        if region is not None and region not in REGIONAL_BASE_URLS:
            raise ValueError("region must be one of: global, eu, us")
        validate_controls(timeout, max_retries)
        self.base_url = (base_url or REGIONAL_BASE_URLS[region or "global"]).rstrip("/")
        self.headers = {"Authorization": f"Bearer {key}", "User-Agent": DEFAULT_USER_AGENT,
            "X-Phaseo-Client": client_source or "phaseo-python",
            "X-Phaseo-Client-Version": client_source_version or DEFAULT_USER_AGENT.removeprefix("phaseo-python/"), **(headers or {})}
        for field, header in (("id", "X-App-Id"), ("name", "X-App-Name"), ("url", "HTTP-Referer")):
            if app and app.get(field):
                self.headers[header] = app[field]
        self.timeout, self.max_retries = timeout, max_retries
        self.http = http_client or httpx.AsyncClient()
        self._owned = http_client is None
        self.on_request, self.on_response, self.on_retry = on_request, on_response, on_retry
        self.responses = AsyncTextResource(self, "/responses")
        self.chat = AsyncChat(self)
        self.messages = AsyncTextResource(self, "/messages")
        self.images = AsyncImages(self, "/images/generations")
        self.audio = AsyncAudio(self)
        self.embeddings = AsyncResource(self, "/embeddings")
        self.ocr = AsyncResource(self, "/ocr")
        self.parse = AsyncResource(self, "/parse")
        self.rerank = AsyncResource(self, "/rerank")
        self.moderations = AsyncResource(self, "/moderations")
        self.decisions = AsyncDecisions(self, "/decisions")
        self.models = AsyncModels(self, "/models")
        self.files = AsyncFiles(self, "/batches/files")
        self.music = AsyncJobs(self, "/music/generate", "music")
        self.videos = AsyncJobs(self, "/videos", "video")
        self.batches = AsyncJobs(self, "/batches", "batch")

    def with_options(self, *, timeout: float | None = None, max_retries: int | None = None, headers: dict[str, str] | None = None) -> "AsyncPhaseo":
        return AsyncPhaseo(api_key=self.headers["Authorization"].removeprefix("Bearer "), base_url=self.base_url,
            timeout=self.timeout if timeout is None else timeout, max_retries=self.max_retries if max_retries is None else max_retries,
            headers={**self.headers, **(headers or {})}, http_client=self.http,
            on_request=self.on_request, on_response=self.on_response, on_retry=self.on_retry)

    @asynccontextmanager
    async def _stream(self, method: str, path: str, **kwargs: Any) -> AsyncIterator[httpx.Response]:
        if not path.startswith("/") or path.startswith("//"):
            raise ValueError("Expected a relative API path")
        timeout = kwargs.pop("request_timeout", self.timeout)
        max_retries = kwargs.pop("max_retries", self.max_retries)
        idempotency_key = kwargs.pop("idempotency_key", None)
        kwargs["headers"] = {**self.headers, **kwargs.pop("headers", {})}
        if idempotency_key:
            kwargs["headers"]["Idempotency-Key"] = idempotency_key
        validate_controls(timeout, max_retries)
        retries = max_retries if method.upper() in ("GET", "HEAD") else 0
        for attempt in range(retries + 1):
            if self.on_request:
                self.on_request({"method": method.upper(), "attempt": attempt})
            context = self.http.stream(method, self.base_url + path, timeout=timeout, follow_redirects=False, **kwargs)
            try:
                response = await context.__aenter__()
            except httpx.TransportError as error:
                if attempt >= retries:
                    raise
                delay = min(.25 * 2 ** attempt, 5)
                if self.on_retry:
                    self.on_retry({"method": method.upper(), "attempt": attempt + 1, "delay": delay, "error": error})
                await asyncio.sleep(delay)
                continue
            if response.status_code in (408, 429, 500, 502, 503, 504) and attempt < retries:
                delay = retry_after(response)
                await context.__aexit__(None, None, None)
                wait = delay if delay is not None else min(.25 * 2 ** attempt, 5)
                if self.on_retry:
                    self.on_retry({"method": method.upper(), "attempt": attempt + 1, "status_code": response.status_code, "delay": wait})
                await asyncio.sleep(wait)
                continue
            if self.on_response:
                self.on_response({"method": method.upper(), "attempt": attempt, "status_code": response.status_code, "headers": response.headers})
            try:
                if not response.is_success:
                    await response.aread()
                    raise PhaseoHTTPError(response)
                yield response
            finally:
                await context.__aexit__(None, None, None)
            return

    async def request(self, method: str, path: str, *, query: dict[str, Any] | None = None, headers: dict[str, str] | None = None, body: Any = None,
                      timeout: float | None = None, max_retries: int | None = None, idempotency_key: str | None = None) -> Any:
        return (await self.request_with_response(method, path, query=query, headers=headers, body=body, timeout=timeout,
                                                 max_retries=max_retries, idempotency_key=idempotency_key)).data

    async def request_with_response(self, method: str, path: str, *, query: dict[str, Any] | None = None, headers: dict[str, str] | None = None, body: Any = None,
                                    timeout: float | None = None, max_retries: int | None = None, idempotency_key: str | None = None) -> RawResponse[Any]:
        async with self._stream(method, path, params=query, headers=headers or {}, json=body,
                                request_timeout=self.timeout if timeout is None else timeout,
                                max_retries=self.max_retries if max_retries is None else max_retries,
                                idempotency_key=idempotency_key) as response:
            await response.aread()
            data = decode_response(response)
            request_id = response.headers.get("x-request-id") or response.headers.get("x-phaseo-request-id")
            return RawResponse(data, response.status_code, response.headers, request_id, request_trace_url(request_id) if request_id else None)

    async def stream_content(self, path: str) -> AsyncIterator[bytes]:
        async with self._stream("GET", path) as response:
            async for chunk in response.aiter_bytes():
                yield chunk

    async def check_model_capabilities(self, model_id: str, **requirements: Any) -> dict[str, Any]:
        payload = await self.request("GET", "/models", query={"model_id": model_id, "limit": 1})
        model = next((item for item in payload.get("models", []) if item.get("id", item.get("model_id")) == model_id), None)
        return check_capabilities(model, **requirements) if model else {"ok": False, "issues": [f"Model {model_id} was not found in the catalogue"]}

    async def get_model_endpoint_capabilities(
        self,
        model_id: str,
        params: dict[str, Any] | None = None,
    ) -> APIResponse:
        if model_id.count("/") != 1:
            raise ValueError("model_id must use author/slug format")
        author, slug = model_id.split("/", 1)
        if not author or not slug:
            raise ValueError("model_id must use author/slug format")
        return await self.request(
            "GET",
            f"/models/{quote(author, safe='')}/{quote(slug, safe='')}/endpoints",
            query=params,
        )

    async def check_model_parameters(
        self,
        model_id: str,
        parameter_values: dict[str, Any],
        *,
        endpoint: str | None = None,
        provider: str | list[str] | None = None,
    ) -> dict[str, Any]:
        capabilities = await self.get_model_endpoint_capabilities(model_id)
        return check_parameter_support(
            capabilities,
            parameter_values,
            endpoint=endpoint,
            provider=provider,
        )

    async def close(self) -> None:
        if self._owned:
            await self.http.aclose()

    async def __aenter__(self) -> "AsyncPhaseo":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


async def collect_async_stream(events: AsyncIterator[dict[str, Any]]) -> dict[str, Any]:
    state: dict[str, Any] = {"text": "", "usage": None, "last_event": None, "final_response": None}
    try:
        async for event in events:
            _accumulate_event(state, event)
    finally:
        close = getattr(events, "aclose", None)
        if close:
            await close()
    return state
