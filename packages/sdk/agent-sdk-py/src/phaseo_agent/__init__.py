from __future__ import annotations

from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from datetime import datetime, timezone
from pathlib import Path
from time import sleep
from typing import Any, Callable, Dict, Iterable, Iterator, List, Optional, Protocol
import json
import os
import uuid
import threading

from phaseo import Phaseo


@dataclass
class AgentToolCall:
    id: str
    name: str
    input: Any


@dataclass
class AgentMessage:
    role: str
    content: str
    tool_calls: List[AgentToolCall] = field(default_factory=list)
    tool_call_id: Optional[str] = None
    name: Optional[str] = None
    is_error: bool = False


@dataclass
class AgentTool:
    id: str
    execute: Optional[Callable[[Any, "AgentRuntimeContext"], Any]] = None
    description: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    timeout_ms: Optional[int] = None
    input_schema: Any = None
    output_schema: Any = None
    event_schema: Any = None
    require_approval: Any = False
    on_tool_called: Optional[Callable[[Any, "AgentRuntimeContext"], Any]] = None
    on_response_received: Optional[Callable[[Any, "AgentRuntimeContext"], Any]] = None
    next_turn_params: Optional[Dict[str, Any]] = None
    on_error: str = "fail-run"


@dataclass
class AgentRuntimeContext:
    run_id: str
    agent_id: str
    step_index: int
    context: Any = None
    tool_call: Optional[AgentToolCall] = None
    emit_progress: Callable[[Any], None] = lambda _value: None
    set_context: Callable[[Any], None] = lambda _value: None


@dataclass
class AgentModelRequest:
    agent_id: str
    messages: List[AgentMessage]
    tools: List[AgentTool]
    model: Optional[str] = None
    instructions: Optional[str] = None
    context: Any = None
    temperature: Optional[float] = None
    max_output_tokens: Optional[int] = None
    top_p: Optional[float] = None
    stream: bool = False
    cancel_event: Optional[threading.Event] = None


@dataclass
class AgentModelResponse:
    message: AgentMessage
    usage: Optional[Dict[str, Any]] = None
    request_id: Optional[str] = None
    native_response_id: Optional[str] = None
    provider: Optional[str] = None
    model: Any = None
    response_meta: Optional[Dict[str, Any]] = None
    finish_reason: Optional[str] = None
    cost: Optional[float] = None
    warnings: List[Dict[str, str]] = field(default_factory=list)


@dataclass
class AgentDefinition:
    id: str
    model: Any = None
    preset: Optional[str] = None
    instructions: Any = None
    tools: List[AgentTool] = field(default_factory=list)
    max_steps: int = 12
    parse_output: Optional[Callable[[str], Any]] = None
    human_review: Optional[Callable[["AgentHumanReviewContext"], Optional["AgentHumanReviewRequest"]]] = None
    model_retry: Optional["AgentModelRetryConfig"] = None
    tool_execution: Optional["AgentToolExecutionConfig"] = None
    stop_when: Any = None
    temperature: Any = None
    max_output_tokens: Any = None
    top_p: Any = None
    output_schema: Any = None
    require_approval: Optional[Callable[[AgentToolCall, AgentRuntimeContext], bool]] = None


@dataclass
class AgentModelRetryConfig:
    max_retries: int = 0
    backoff_ms: int = 250


@dataclass
class AgentToolExecutionConfig:
    tool_concurrency: int = 1


@dataclass
class AgentHumanReviewRequest:
    reason: str
    payload: Any = None


@dataclass
class AgentHumanPause:
    reason: str
    payload: Any = None
    requested_at: str = ""
    kind: str = "human_review"
    pending_tool_calls: List["AgentPendingToolCall"] = field(default_factory=list)


@dataclass
class AgentPendingToolCall:
    call: AgentToolCall
    kind: str
    reason: Optional[str] = None


@dataclass
class AgentToolDecision:
    tool_call_id: str
    reason: Optional[str] = None


@dataclass
class AgentToolOutput:
    tool_call_id: str
    output: Any


@dataclass
class AgentUsageSummary:
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0
    total_tokens: int = 0
    cost: float = 0.0


@dataclass
class AgentHumanReviewContext:
    run_id: str
    agent_id: str
    step_index: int
    input: Any
    context: Any
    messages: List[AgentMessage]
    response: AgentModelResponse
    parsed_output: Any = None


@dataclass
class AgentStepRecord:
    index: int
    status: str = "pending"
    tool_calls: List[AgentToolCall] = field(default_factory=list)
    request_id: Optional[str] = None
    native_response_id: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    model_attempts: int = 0
    usage: Optional[Dict[str, Any]] = None
    response_meta: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    finish_reason: Optional[str] = None
    warnings: List[Dict[str, str]] = field(default_factory=list)


@dataclass
class AgentRunRecord:
    id: str
    agent_id: str
    status: str
    input: Any
    messages: List[AgentMessage]
    step_count: int = 0
    result: Any = None
    error: Optional[str] = None
    context: Any = None
    pause: Optional[AgentHumanPause] = None
    created_at: str = ""
    updated_at: str = ""
    stop_reason: Optional[str] = None
    usage: AgentUsageSummary = field(default_factory=AgentUsageSummary)
    next_turn_params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentRunResult:
    run: AgentRunRecord
    steps: List[AgentStepRecord]
    output: Any
    messages: List[AgentMessage]
    usage: AgentUsageSummary = field(default_factory=AgentUsageSummary)


class AgentStateAccessor(Protocol):
    def load(self, run_id: str) -> Optional[AgentRunResult]: ...
    def save(self, result: AgentRunResult) -> None: ...


class AgentStreamResult:
    def __init__(self, execute: Callable[[Callable[[Dict[str, Any]], None], threading.Event], AgentRunResult]):
        self._events: List[Dict[str, Any]] = []
        self._condition = threading.Condition()
        self._result: Optional[AgentRunResult] = None
        self._error: Optional[BaseException] = None
        self._cancel_event = threading.Event()
        def target() -> None:
            try: self._result = execute(self._push, self._cancel_event)
            except BaseException as error: self._error = error
            finally:
                with self._condition: self._condition.notify_all()
        threading.Thread(target=target, daemon=True).start()
    def cancel(self) -> None:
        self._cancel_event.set()
    def _push(self, event: Dict[str, Any]) -> None:
        with self._condition: self._events.append(event); self._condition.notify_all()
    def result(self) -> AgentRunResult:
        with self._condition:
            while self._result is None and self._error is None: self._condition.wait()
        if self._error: raise self._error
        return self._result  # type: ignore[return-value]
    def full_stream(self) -> Iterator[Dict[str, Any]]:
        index = 0
        while True:
            with self._condition:
                while index >= len(self._events) and self._result is None and self._error is None: self._condition.wait()
                if index < len(self._events): event = self._events[index]; index += 1
                elif self._error: raise self._error
                else: return
            yield event
    def text_stream(self) -> Iterator[str]:
        for event in self.full_stream():
            if event.get("type") == "response.output_text.delta": yield str(event.get("delta", ""))
    def reasoning_stream(self) -> Iterator[str]:
        for event in self.full_stream():
            if event.get("type") == "response.reasoning.delta": yield str(event.get("delta", ""))
    def item_stream(self) -> Iterator[Any]:
        for event in self.full_stream():
            if event.get("type") == "response.item": yield event.get("item")
    def tool_stream(self) -> Iterator[Dict[str, Any]]:
        for event in self.full_stream():
            if str(event.get("type", "")).startswith("tool."): yield event


@dataclass
class AgentDevtoolsConfig:
    enabled: bool = True
    directory: str = ".phaseo-devtools"


AgentEventHandler = Callable[[Dict[str, Any]], None]


def create_agent_devtools(**kwargs: Any) -> AgentDevtoolsConfig:
    return AgentDevtoolsConfig(**kwargs)


def define_tool(tool: AgentTool) -> AgentTool:
    return tool


def tool(tool_value: AgentTool) -> AgentTool:
    return define_tool(tool_value)


def _validate(schema: Any, value: Any, label: str) -> Any:
    if schema is None:
        return value
    try:
        if callable(schema):
            return schema(value)
        if hasattr(schema, "model_validate"):
            return schema.model_validate(value)
        if hasattr(schema, "parse"):
            return schema.parse(value)
        if hasattr(schema, "safe_parse"):
            result = schema.safe_parse(value)
            if getattr(result, "success", False):
                return result.data
            raise ValueError(str(getattr(result, "error", "validation failed")))
    except BaseException as error:
        raise ValueError(f"Invalid {label}: {error}") from error
    raise TypeError(f"Unsupported schema for {label}")


def _dynamic(value: Any, turn: Dict[str, Any]) -> Any:
    return value(turn) if callable(value) else value


def _usage(response: AgentModelResponse) -> AgentUsageSummary:
    raw = response.usage or {}
    input_tokens = int(raw.get("input_tokens", raw.get("prompt_tokens", 0)) or 0)
    output_tokens = int(raw.get("output_tokens", raw.get("completion_tokens", 0)) or 0)
    cached_tokens = int(raw.get("cached_tokens", raw.get("cache_read_input_tokens", 0)) or 0)
    total_tokens = int(raw.get("total_tokens", input_tokens + output_tokens) or 0)
    return AgentUsageSummary(input_tokens, output_tokens, cached_tokens, total_tokens, float(response.cost or raw.get("cost", 0) or 0))


def step_count_is(limit: int) -> Callable[[Dict[str, Any]], Any]:
    return lambda state: f"step_count:{limit}" if state["step_count"] >= limit else False


def max_tokens_used(limit: int) -> Callable[[Dict[str, Any]], Any]:
    return lambda state: f"max_tokens:{limit}" if state["usage"].total_tokens >= limit else False


def max_cost(limit: float) -> Callable[[Dict[str, Any]], Any]:
    return lambda state: f"max_cost:{limit}" if state["usage"].cost >= limit else False


def has_tool_call(name: str) -> Callable[[Dict[str, Any]], Any]:
    return lambda state: f"tool_call:{name}" if any(call.name == name for call in state["tool_calls"]) else False


def finish_reason_is(reason: str) -> Callable[[Dict[str, Any]], Any]:
    return lambda state: f"finish_reason:{reason}" if state.get("finish_reason") == reason else False


def max_duration(milliseconds: int) -> Callable[[Dict[str, Any]], Any]:
    return lambda state: f"max_duration:{milliseconds}" if state.get("elapsed_ms", 0) >= milliseconds else False


def _to_preset_alias(value: Optional[str]) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lstrip("@")
    return f"@{normalized}" if normalized else None


def _coerce_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value)


def _to_responses_input(messages: List[AgentMessage]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for message in messages:
        if message.role == "system":
            continue
        if message.role == "tool":
            items.append(
                {
                    "type": "function_call_output",
                    "call_id": message.tool_call_id,
                    "output": _coerce_text(message.content),
                }
            )
            continue

        base: Dict[str, Any] = {
            "type": "message",
            "role": message.role,
            "content": _coerce_text(message.content),
        }
        if message.role == "assistant" and message.tool_calls:
            base["tool_calls"] = [
                {
                    "id": tool_call.id,
                    "type": "function",
                    "function": {
                        "name": tool_call.name,
                        "arguments": json.dumps(tool_call.input),
                    },
                }
                for tool_call in message.tool_calls
            ]
        items.append(base)
    return items


def _to_instructions(messages: List[AgentMessage], override: Optional[str]) -> Optional[str]:
    system_messages = "\n\n".join(
        message.content.strip()
        for message in messages
        if message.role == "system" and message.content.strip()
    )
    if override and system_messages:
        return f"{override}\n\n{system_messages}"
    return override or system_messages or None


def _safe_parse_tool_input(raw: Optional[str]) -> Any:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {"raw": raw}


def _extract_tool_calls(response: Dict[str, Any]) -> List[AgentToolCall]:
    items = response.get("output_items") or response.get("output") or []
    calls: List[AgentToolCall] = []
    for index, item in enumerate(items):
        if str(item.get("type", "")).lower() != "function_call":
            continue
        calls.append(
            AgentToolCall(
                id=item.get("call_id") or f"tool_call_{index}",
                name=item.get("name") or "tool",
                input=_safe_parse_tool_input(item.get("arguments")),
            )
        )
    return calls


def _extract_assistant_text(response: Dict[str, Any]) -> str:
    items = response.get("output_items") or response.get("output") or []
    parts: List[str] = []
    for item in items:
        if str(item.get("type", "")).lower() != "message":
            continue
        for content_part in item.get("content") or []:
            if str(content_part.get("type", "")).lower() == "output_text":
                text = content_part.get("text")
                if isinstance(text, str) and text:
                    parts.append(text)
    return "\n\n".join(parts)


def _response_cost(response: Dict[str, Any]) -> Optional[float]:
    usage = response.get("usage") if isinstance(response.get("usage"), dict) else {}
    meta = response.get("meta") if isinstance(response.get("meta"), dict) else {}
    for value in (response.get("cost"), response.get("cost_usd"), usage.get("cost"), meta.get("cost"), meta.get("cost_usd")):
        if isinstance(value, (int, float)):
            return float(value)
    nanos = response.get("cost_nanos", meta.get("cost_nanos"))
    return float(nanos) / 1_000_000_000 if isinstance(nanos, (int, float)) else None


def _to_model_response(response: Dict[str, Any]) -> AgentModelResponse:
    warnings = response.get("warnings")
    return AgentModelResponse(
        message=AgentMessage("assistant", _extract_assistant_text(response), _extract_tool_calls(response)),
        usage=response.get("usage") if isinstance(response.get("usage"), dict) else None,
        request_id=response.get("request_id") or response.get("id"),
        native_response_id=response.get("native_response_id") or response.get("nativeResponseId"),
        provider=response.get("provider"),
        model=response.get("model"),
        response_meta=response.get("meta") if isinstance(response.get("meta"), dict) else None,
        finish_reason=response.get("finish_reason") or response.get("stop_reason") or response.get("status"),
        cost=_response_cost(response),
        warnings=list(warnings) if isinstance(warnings, list) else [],
    )


class GatewayAgentClient:
    def __init__(
        self,
        *,
        client: Optional[Phaseo] = None,
        client_options: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
        preset: Optional[str] = None,
        provider: Optional[Dict[str, Any]] = None,
        reasoning: Optional[Dict[str, Any]] = None,
        temperature: Optional[float] = None,
        max_output_tokens: Optional[int] = None,
        parallel_tool_calls: Optional[bool] = None,
        metadata: Optional[Dict[str, str]] = None,
        user: Optional[str] = None,
        response_format: Optional[Dict[str, Any]] = None,
        include_meta: Optional[bool] = None,
        web_search_options: Optional[Dict[str, Any]] = None,
        plugins: Optional[List[Dict[str, Any]]] = None,
        gateway_tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        provider_options: Optional[Dict[str, Any]] = None,
        prompt_cache_key: Optional[str] = None,
        request_options: Optional[Dict[str, Any]] = None,
    ):
        if client is None:
            options = client_options or {}
            api_key = options.get("api_key")
            if not api_key:
                raise ValueError("PHASEO_API_KEY is required")
            base_url = options.get("base_url")
            client = Phaseo(api_key=api_key, base_url=base_url, client_source="phaseo-agent-python", client_source_version="0.3.0") if base_url else Phaseo(api_key=api_key, client_source="phaseo-agent-python", client_source_version="0.3.0")
        self._client = client
        self._model = model
        self._preset = preset
        self._provider = provider
        self._reasoning = reasoning
        self._temperature = temperature
        self._max_output_tokens = max_output_tokens
        self._parallel_tool_calls = parallel_tool_calls
        self._metadata = metadata
        self._user = user
        self._response_format = response_format
        self._include_meta = include_meta
        self._web_search_options = web_search_options
        self._plugins = plugins
        self._gateway_tools = gateway_tools or []
        self._tool_choice = tool_choice
        self._provider_options = provider_options
        self._prompt_cache_key = prompt_cache_key
        self._request_options = request_options or {}

    def _payload(self, request: AgentModelRequest, stream: bool = False) -> Dict[str, Any]:
        payload = {
            **self._request_options,
            "model": request.model or self._model or _to_preset_alias(self._preset) or "phaseo/free",
            "input": _to_responses_input(request.messages),
            "instructions": _to_instructions(request.messages, request.instructions),
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": tool.id,
                        "description": tool.description,
                        "parameters": tool.parameters
                        or {"type": "object", "additionalProperties": True},
                    },
                }
                for tool in request.tools
            ]
            + list(self._gateway_tools),
            "tool_choice": self._tool_choice,
            "parallel_tool_calls": self._parallel_tool_calls,
            "temperature": request.temperature if request.temperature is not None else self._temperature,
            "max_output_tokens": request.max_output_tokens if request.max_output_tokens is not None else self._max_output_tokens,
            "top_p": request.top_p,
            "provider": self._provider,
            "reasoning": self._reasoning,
            "metadata": self._metadata,
            "meta": self._include_meta,
            "user": self._user,
            "response_format": self._response_format,
            "web_search_options": self._web_search_options,
            "plugins": self._plugins,
            "provider_options": self._provider_options,
            "prompt_cache_key": self._prompt_cache_key,
            "stream": stream,
        }
        if not payload["tools"]:
            payload["tools"] = None
        return {key: value for key, value in payload.items() if value is not None}

    def generate(self, request: AgentModelRequest) -> AgentModelResponse:
        payload = self._payload(request)
        response = self._client.responses.create(payload)
        if not isinstance(response, dict):
            raise TypeError("Expected a non-streaming Responses API object")
        return _to_model_response(response)

    def stream(self, request: AgentModelRequest) -> Iterator[Dict[str, Any]]:
        text_parts: List[str] = []
        completed = False
        source = self._client.responses.create(self._payload(request, True))
        for chunk in source:
            if request.cancel_event and request.cancel_event.is_set():
                close = getattr(source, "close", None)
                if callable(close):
                    close()
                raise InterruptedError("Agent stream cancelled")
            raw = dict(chunk) if isinstance(chunk, dict) else {}
            event_type = str(raw.get("type", ""))
            delta = raw.get("delta") if isinstance(raw.get("delta"), str) else raw.get("text") if isinstance(raw.get("text"), str) else ""
            if "reasoning" in event_type and delta:
                yield {"type": "response.reasoning.delta", "delta": delta, "raw": raw}
            elif delta and ("output_text.delta" in event_type or not event_type):
                text_parts.append(delta)
                yield {"type": "response.output_text.delta", "delta": delta, "raw": raw}
            if raw.get("item") is not None:
                yield {"type": "response.item", "item": raw["item"], "raw": raw}
            if event_type == "response.completed":
                response = raw.get("response") if isinstance(raw.get("response"), dict) else raw
                yield {"type": "response.completed", "response": _to_model_response(response), "raw": raw}
                completed = True
                break
        if not completed:
            yield {"type": "response.completed", "response": AgentModelResponse(AgentMessage("assistant", "".join(text_parts)))}


def create_gateway_agent_client(**kwargs: Any) -> GatewayAgentClient:
    return GatewayAgentClient(**kwargs)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _emit(handler: Optional[AgentEventHandler], event_type: str, run: AgentRunRecord, **details: Any) -> None:
    if handler:
        handler(
            {
                "type": event_type,
                "run_id": run.id,
                "agent_id": run.agent_id,
                "timestamp": _now_iso(),
                "status": run.status,
                **details,
            }
        )


def _jsonable(value: Any) -> Any:
    if hasattr(value, "__dataclass_fields__"):
        return {key: _jsonable(getattr(value, key)) for key in value.__dataclass_fields__}
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _capture_devtools(
    definition: AgentDefinition,
    result: Optional[AgentRunResult],
    started_at: float,
    operation: str,
    config: Optional[AgentDevtoolsConfig],
    error: Optional[BaseException] = None,
) -> None:
    enabled = config.enabled if config else os.getenv("PHASEO_DEVTOOLS") == "true"
    if not enabled:
        return
    directory = Path(config.directory if config else os.getenv("PHASEO_DEVTOOLS_DIR", ".phaseo-devtools"))
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "assets" / "images").mkdir(parents=True, exist_ok=True)
    (directory / "assets" / "audio").mkdir(parents=True, exist_ok=True)
    (directory / "assets" / "video").mkdir(parents=True, exist_ok=True)
    metadata_path = directory / "metadata.json"
    if not metadata_path.exists():
        metadata_path.write_text(
            json.dumps({"session_id": str(uuid.uuid4()), "started_at": int(started_at * 1000), "sdk": "python"}, indent=2),
            encoding="utf-8",
        )
    run = result.run if result else None
    entry = {
        "id": run.id if run else str(uuid.uuid4()),
        "type": operation,
        "timestamp": int(started_at * 1000),
        "request": {"agent_id": definition.id, "tool_count": len(definition.tools)},
        "response": _jsonable(result) if result else None,
        "error": {"message": str(error)} if error else None,
        "metadata": {
            "sdk": "python",
            "agent_id": definition.id,
            "run_id": run.id if run else None,
            "run_status": run.status if run else None,
            "step_count": len(result.steps) if result else None,
        },
    }
    with (directory / "generations.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(entry, default=_jsonable) + "\n")


class Agent:
    def __init__(self, definition: AgentDefinition):
        self.definition = definition

    def run(
        self,
        *,
        input: Any,
        client: GatewayAgentClient,
        context: Any = None,
        model: Optional[str] = None,
        max_steps: Optional[int] = None,
        preset: Optional[str] = None,
        model_retry: Optional[AgentModelRetryConfig] = None,
        tool_execution: Optional[AgentToolExecutionConfig] = None,
        on_event: Optional[AgentEventHandler] = None,
        devtools: Optional[AgentDevtoolsConfig] = None,
        state: Optional[AgentStateAccessor] = None,
        stop_when: Any = None,
        _streaming: bool = False,
        _cancel_event: Optional[threading.Event] = None,
    ) -> AgentRunResult:
        started_at = __import__("time").time()
        run_id = str(uuid.uuid4())
        created_at = _now_iso()
        messages: List[AgentMessage] = []
        if isinstance(self.definition.instructions, str) and self.definition.instructions:
            messages.append(AgentMessage(role="system", content=self.definition.instructions))
        messages.append(
            AgentMessage(
                role="user",
                content=input if isinstance(input, str) else json.dumps(input, indent=2),
            )
        )
        run = AgentRunRecord(
            id=run_id,
            agent_id=self.definition.id,
            status="queued",
            input=input,
            messages=messages,
            context=context,
            created_at=created_at,
            updated_at=created_at,
        )
        _emit(on_event, "run.started", run)
        try:
            result = self._execute(
                run=run,
                steps=[],
                client=client,
                context=context,
                model=model,
                preset=preset,
                max_steps=max_steps,
                model_retry=model_retry,
                tool_execution=tool_execution,
                on_event=on_event,
                streaming=_streaming,
                cancel_event=_cancel_event,
            )
            _capture_devtools(self.definition, result, started_at, "agent.run", devtools)
            if state:
                state.save(result)
            return result
        except BaseException as error:
            _capture_devtools(self.definition, None, started_at, "agent.run", devtools, error)
            raise

    def continue_run(
        self,
        *,
        run: Optional[AgentRunResult] = None,
        run_id: Optional[str] = None,
        client: GatewayAgentClient,
        human_input: Optional[str] = None,
        context: Any = None,
        model: Optional[str] = None,
        preset: Optional[str] = None,
        max_steps: Optional[int] = None,
        model_retry: Optional[AgentModelRetryConfig] = None,
        tool_execution: Optional[AgentToolExecutionConfig] = None,
        on_event: Optional[AgentEventHandler] = None,
        devtools: Optional[AgentDevtoolsConfig] = None,
        state: Optional[AgentStateAccessor] = None,
        approvals: Optional[List[AgentToolDecision | str]] = None,
        rejections: Optional[List[AgentToolDecision | str]] = None,
        tool_outputs: Optional[List[AgentToolOutput]] = None,
        stop_when: Any = None,
        _streaming: bool = False,
        _cancel_event: Optional[threading.Event] = None,
    ) -> AgentRunResult:
        if run is None and state and run_id:
            run = state.load(run_id)
        if run is None:
            raise ValueError("A run or state accessor with run_id is required")
        if run.run.agent_id != self.definition.id:
            raise ValueError(f"Run {run.run.id} belongs to agent {run.run.agent_id}")
        if run.run.status == "waiting_for_human" and not human_input and not run.run.pause.pending_tool_calls:
            raise ValueError(f"Run {run.run.id} is waiting for human input")
        started_at = __import__("time").time()
        previous_status = run.run.status
        if human_input:
            run.messages.append(AgentMessage(role="user", content=human_input))
            run.run.pause = None
        elif run.run.pause and run.run.pause.pending_tool_calls:
            approved = {item if isinstance(item, str) else item.tool_call_id for item in approvals or []}
            rejected = {item if isinstance(item, str) else item.tool_call_id: None if isinstance(item, str) else item.reason for item in rejections or []}
            outputs = {item.tool_call_id: item.output for item in tool_outputs or []}
            tools = {item.id: item for item in self.definition.tools}
            for pending in run.run.pause.pending_tool_calls:
                call = pending.call
                current_tool = tools[call.name]
                if call.id in rejected:
                    run.messages.append(AgentMessage("tool", json.dumps({"error": rejected[call.id] or "Tool call rejected"}), tool_call_id=call.id, name=call.name, is_error=True))
                elif pending.kind == "approval":
                    if call.id not in approved:
                        raise ValueError(f"Missing approval decision for tool call {call.id}")
                    run.messages.append(self._execute_tool(current_tool, call, run.run, run.run.step_count - 1, on_event))
                    if current_tool.next_turn_params:
                        run.run.next_turn_params.update(current_tool.next_turn_params)
                else:
                    if call.id not in outputs:
                        raise ValueError(f"Missing output for tool call {call.id}")
                    value = outputs[call.id]
                    runtime = AgentRuntimeContext(run.run.id, run.run.agent_id, run.run.step_count - 1, run.run.context, call)
                    if current_tool.on_response_received:
                        value = current_tool.on_response_received(value, runtime)
                    value = _validate(current_tool.output_schema, value, "tool output")
                    run.messages.append(AgentMessage("tool", value if isinstance(value, str) else json.dumps(value), tool_call_id=call.id, name=call.name))
            run.run.pause = None
        run.run.status = "running"
        run.run.updated_at = _now_iso()
        _emit(on_event, "run.resumed", run.run, previous_status=previous_status)
        try:
            result = self._execute(
                run=run.run,
                steps=list(run.steps),
                client=client,
                context=run.run.context if context is None else context,
                model=model,
                preset=preset,
                max_steps=max_steps,
                model_retry=model_retry,
                tool_execution=tool_execution,
                on_event=on_event,
                streaming=_streaming,
                cancel_event=_cancel_event,
            )
            _capture_devtools(self.definition, result, started_at, "agent.continue", devtools)
            if state:
                state.save(result)
            return result
        except BaseException as error:
            _capture_devtools(self.definition, None, started_at, "agent.continue", devtools, error)
            raise

    def stream(self, **options: Any) -> AgentStreamResult:
        original = options.pop("on_event", None)
        return AgentStreamResult(lambda emit, cancel: self.run(**options, _streaming=True, _cancel_event=cancel, on_event=lambda event: (emit(event), original(event) if original else None)))

    def continue_stream(self, **options: Any) -> AgentStreamResult:
        original = options.pop("on_event", None)
        return AgentStreamResult(lambda emit, cancel: self.continue_run(**options, _streaming=True, _cancel_event=cancel, on_event=lambda event: (emit(event), original(event) if original else None)))

    def _execute_tool(self, current_tool: AgentTool, call: AgentToolCall, run: AgentRunRecord, step_index: int, on_event: Optional[AgentEventHandler], *, context_value: Any = None, context_sink: Optional[Callable[[Any], None]] = None) -> AgentMessage:
        parsed_input = _validate(current_tool.input_schema, call.input, "tool input")
        preliminary: List[Any] = []
        def progress(value: Any) -> None:
            checked = _validate(current_tool.event_schema, value, "tool progress event")
            preliminary.append(checked)
            _emit(on_event, "tool.preliminary_result", run, step_index=step_index, tool_call_id=call.id, tool_name=call.name, result=checked)
        def set_context(value: Any) -> None:
            if context_sink:
                context_sink(value)
            else:
                run.context = value
        runtime = AgentRuntimeContext(run.id, run.agent_id, step_index, run.context if context_value is None else context_value, call, progress, set_context)
        _emit(on_event, "tool.started", run, step_index=step_index, tool_call_id=call.id, tool_name=call.name)
        if current_tool.execute is None:
            raise ValueError(f"Tool '{call.name}' requires external output")
        timeout_pool = ThreadPoolExecutor(max_workers=1)
        future = timeout_pool.submit(current_tool.execute, parsed_input, runtime)
        try:
            output = future.result(timeout=current_tool.timeout_ms / 1000 if current_tool.timeout_ms else None)
            if isinstance(output, Iterator):
                while True:
                    try:
                        progress(next(output))
                    except StopIteration as completed:
                        output = completed.value
                        break
            output = _validate(current_tool.output_schema, output, "tool output")
        except FutureTimeoutError as error:
            future.cancel()
            raise TimeoutError(f"Tool {call.name} timed out after {current_tool.timeout_ms}ms") from error
        except BaseException as error:
            if current_tool.on_error == "return-to-model":
                _emit(on_event, "tool.failed", run, step_index=step_index, tool_call_id=call.id, tool_name=call.name, error=str(error))
                return AgentMessage("tool", json.dumps({"error": str(error)}), tool_call_id=call.id, name=call.name, is_error=True)
            raise
        finally:
            timeout_pool.shutdown(wait=False, cancel_futures=True)
        _emit(on_event, "tool.completed", run, step_index=step_index, tool_call_id=call.id, tool_name=call.name, output=output, preliminary_results=preliminary)
        return AgentMessage("tool", output if isinstance(output, str) else json.dumps(output), tool_call_id=call.id, name=call.name)

    def _execute(
        self,
        *,
        run: AgentRunRecord,
        steps: List[AgentStepRecord],
        client: GatewayAgentClient,
        context: Any,
        model: Optional[str],
        preset: Optional[str],
        max_steps: Optional[int],
        model_retry: Optional[AgentModelRetryConfig],
        tool_execution: Optional[AgentToolExecutionConfig],
        on_event: Optional[AgentEventHandler],
        streaming: bool = False,
        cancel_event: Optional[threading.Event] = None,
    ) -> AgentRunResult:
        run.status = "running"
        effective_max_steps = max_steps or self.definition.max_steps or 12
        retry = model_retry or self.definition.model_retry or AgentModelRetryConfig()
        execution = tool_execution or self.definition.tool_execution or AgentToolExecutionConfig()
        tools_by_id = {tool.id: tool for tool in self.definition.tools}
        target_model = model or _to_preset_alias(preset) or _to_preset_alias(self.definition.preset)

        next_turn: Dict[str, Any] = dict(run.next_turn_params); run.next_turn_params = {}; loop_started = __import__("time").time()
        for step_index in range(run.step_count, effective_max_steps):
            turn = {"number_of_turns": step_index + 1, "step_index": step_index, "messages": list(run.messages), "context": run.context}
            dynamic_model = target_model or _dynamic(self.definition.model, turn)
            dynamic_instructions = _dynamic(self.definition.instructions, turn)
            temperature = _dynamic(self.definition.temperature, turn); max_output_tokens = _dynamic(self.definition.max_output_tokens, turn); top_p = _dynamic(self.definition.top_p, turn); turn_tools = self.definition.tools
            if next_turn:
                dynamic_model = next_turn.get("model", dynamic_model); dynamic_instructions = next_turn.get("instructions", dynamic_instructions); temperature = next_turn.get("temperature", temperature); max_output_tokens = next_turn.get("max_output_tokens", max_output_tokens); top_p = next_turn.get("top_p", top_p); turn_tools = next_turn.get("tools", turn_tools); next_turn = {}
            tools_by_id = {tool.id: tool for tool in turn_tools}
            step = AgentStepRecord(index=step_index, status="executing_model")
            steps.append(step)
            _emit(on_event, "step.started", run, step_index=step_index)
            model_response: Optional[AgentModelResponse] = None
            for attempt in range(max(0, retry.max_retries) + 1):
                if cancel_event and cancel_event.is_set():
                    raise InterruptedError("Agent stream cancelled")
                step.model_attempts = attempt + 1
                _emit(on_event, "model.requested", run, step_index=step_index, attempt=attempt + 1, model=dynamic_model)
                try:
                    request = AgentModelRequest(
                            agent_id=self.definition.id,
                            model=dynamic_model,
                            instructions=dynamic_instructions,
                            messages=list(run.messages),
                            tools=turn_tools,
                            context=run.context,
                            temperature=temperature,
                            max_output_tokens=max_output_tokens,
                            top_p=top_p,
                            stream=streaming,
                            cancel_event=cancel_event,
                        )
                    if streaming and hasattr(client, "stream"):
                        text = ""; reasoning = ""
                        for event in client.stream(request):
                            event_type = event.get("type") if isinstance(event, dict) else getattr(event, "type", None)
                            if event_type == "response.output_text.delta": text += str(event.get("delta", "")); _emit(on_event, event_type, run, step_index=step_index, delta=event.get("delta", ""))
                            elif event_type == "response.reasoning.delta": reasoning += str(event.get("delta", "")); _emit(on_event, event_type, run, step_index=step_index, delta=event.get("delta", ""))
                            elif event_type == "response.item": _emit(on_event, event_type, run, step_index=step_index, item=event.get("item"))
                            elif event_type == "response.completed": model_response = event.get("response")
                        model_response = model_response or AgentModelResponse(AgentMessage("assistant", text))
                    else:
                        model_response = client.generate(request)
                    break
                except BaseException as error:
                    if attempt >= max(0, retry.max_retries):
                        step.status = "failed"
                        step.error = str(error)
                        raise
                    sleep(max(0, retry.backoff_ms) * (attempt + 1) / 1000)
            assert model_response is not None
            response = model_response
            run.messages.append(response.message)
            run.step_count = step_index + 1
            run.updated_at = _now_iso()
            step.request_id = response.request_id
            step.native_response_id = response.native_response_id
            step.provider = response.provider
            step.model = response.model or dynamic_model
            step.usage = response.usage
            step.tool_calls = list(response.message.tool_calls)
            step.response_meta = response.response_meta
            step.finish_reason = response.finish_reason; step.warnings = list(response.warnings)
            current_usage = _usage(response)
            run.usage.input_tokens += current_usage.input_tokens
            run.usage.output_tokens += current_usage.output_tokens
            run.usage.cached_tokens += current_usage.cached_tokens
            run.usage.total_tokens += current_usage.total_tokens
            run.usage.cost += current_usage.cost
            _emit(on_event, "model.completed", run, step_index=step_index, attempt=step.model_attempts, request_id=response.request_id, model=step.model)

            parsed_output = self.definition.parse_output(response.message.content) if self.definition.parse_output and not response.message.tool_calls else None
            if self.definition.human_review:
                review = self.definition.human_review(
                    AgentHumanReviewContext(
                        run_id=run.id,
                        agent_id=run.agent_id,
                        step_index=step_index,
                        input=run.input,
                        context=context,
                        messages=list(run.messages),
                        response=response,
                        parsed_output=parsed_output,
                    )
                )
                if review:
                    run.status = "waiting_for_human"
                    run.pause = AgentHumanPause(review.reason, review.payload, _now_iso())
                    step.status = "checkpointed"
                    _emit(on_event, "checkpoint.saved", run, step_index=step_index)
                    _emit(on_event, "run.waiting_for_human", run, step_index=step_index, pause=_jsonable(run.pause))
                    return AgentRunResult(run=run, steps=steps, output=None, messages=run.messages)

            if response.message.tool_calls:
                run.status = "waiting_for_tools"
                step.status = "executing_tools"
                automatic: List[tuple[AgentTool, AgentToolCall]] = []
                pending: List[AgentPendingToolCall] = []
                for call in response.message.tool_calls:
                    current_tool = tools_by_id.get(call.name)
                    if current_tool is None:
                        raise ValueError(f"Unknown tool '{call.name}'")
                    call.input = _validate(current_tool.input_schema, call.input, "tool input")
                    runtime = AgentRuntimeContext(run.id, run.agent_id, step_index, run.context, call)
                    if current_tool.on_tool_called:
                        prefetched = current_tool.on_tool_called(call.input, runtime)
                        if prefetched is None:
                            pending.append(AgentPendingToolCall(call, "hitl", "Tool requires human input"))
                        else:
                            automatic.append((AgentTool(current_tool.id, lambda _input, _context, value=prefetched: value, output_schema=current_tool.output_schema), call))
                        continue
                    gate = self.definition.require_approval(call, runtime) if self.definition.require_approval else current_tool.require_approval
                    if callable(gate):
                        gate = gate(call.input, runtime)
                    if gate:
                        pending.append(AgentPendingToolCall(call, "approval", "Tool requires approval"))
                    elif current_tool.execute is None:
                        pending.append(AgentPendingToolCall(call, "manual", "Tool requires external output"))
                    else:
                        automatic.append((current_tool, call))

                context_updates: List[Any] = [None] * len(automatic)
                context_was_set = [False] * len(automatic)
                def execute_call(indexed: tuple[int, tuple[AgentTool, AgentToolCall]]) -> AgentMessage:
                    index, entry = indexed
                    def update(value: Any) -> None:
                        context_updates[index] = value
                        context_was_set[index] = True
                    return self._execute_tool(entry[0], entry[1], run, step_index, on_event, context_value=run.context, context_sink=update)
                with ThreadPoolExecutor(max_workers=max(1, execution.tool_concurrency)) as pool:
                    run.messages.extend(list(pool.map(execute_call, enumerate(automatic))))
                for index, value in enumerate(context_updates):
                    if context_was_set[index]:
                        run.context = value
                for current_tool, _call in automatic:
                    if current_tool.next_turn_params: next_turn.update(current_tool.next_turn_params)
                if pending:
                    run.next_turn_params = dict(next_turn)
                    run.status = "waiting_for_human"
                    run.pause = AgentHumanPause("Pending tool calls require input", {"tool_calls": pending}, _now_iso(), "tool_approval" if any(item.kind == "approval" for item in pending) else pending[0].kind, pending)
                    step.status = "checkpointed"
                    _emit(on_event, "checkpoint.saved", run, step_index=step_index)
                    _emit(on_event, "run.waiting_for_human", run, step_index=step_index, pause=_jsonable(run.pause))
                    return AgentRunResult(run, steps, None, run.messages, run.usage)
                step.status = "checkpointed"
                _emit(on_event, "checkpoint.saved", run, step_index=step_index)
                continue

            stop_conditions = self.definition.stop_when if isinstance(self.definition.stop_when, list) else [self.definition.stop_when] if self.definition.stop_when else []
            stop_state = {"step_count": run.step_count, "usage": run.usage, "tool_calls": response.message.tool_calls, "finish_reason": response.finish_reason, "elapsed_ms": (__import__("time").time() - loop_started) * 1000}
            reason = next((value for condition in stop_conditions if (value := condition(stop_state))), None)
            output = parsed_output if self.definition.parse_output else response.message.content
            output = _validate(self.definition.output_schema, output, "agent output")
            if reason:
                run.status = "stopped"
                run.stop_reason = str(reason)
                run.result = output
                return AgentRunResult(run, steps, output, run.messages, run.usage)
            run.status = "completed"
            run.result = output
            run.pause = None
            step.status = "checkpointed"
            _emit(on_event, "checkpoint.saved", run, step_index=step_index)
            _emit(on_event, "run.completed", run, output=output)
            return AgentRunResult(run=run, steps=steps, output=output, messages=run.messages, usage=run.usage)

        run.status = "failed"
        run.error = f"Max steps exceeded ({effective_max_steps})"
        run.updated_at = _now_iso()
        _emit(on_event, "run.failed", run, error=run.error)
        raise RuntimeError(run.error)


def create_agent(definition: Dict[str, Any] | AgentDefinition) -> Agent:
    if isinstance(definition, AgentDefinition):
        return Agent(definition)

    normalized_tools = [
        tool if isinstance(tool, AgentTool) else AgentTool(**tool)
        for tool in definition.get("tools", [])
    ]
    return Agent(
        AgentDefinition(
            id=definition["id"],
            model=definition.get("model"),
            preset=definition.get("preset"),
            instructions=definition.get("instructions"),
            tools=normalized_tools,
            max_steps=definition.get("max_steps", 12),
            parse_output=definition.get("parse_output"),
            human_review=definition.get("human_review"),
            model_retry=definition.get("model_retry"),
            tool_execution=definition.get("tool_execution"),
            stop_when=definition.get("stop_when"),
            temperature=definition.get("temperature"),
            max_output_tokens=definition.get("max_output_tokens"),
            top_p=definition.get("top_p"),
            output_schema=definition.get("output_schema"),
            require_approval=definition.get("require_approval"),
        )
    )
