from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional
import json
import os
import uuid

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


@dataclass
class AgentTool:
    id: str
    execute: Callable[[Any, "AgentRuntimeContext"], Any]
    description: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None


@dataclass
class AgentRuntimeContext:
    run_id: str
    agent_id: str
    step_index: int
    context: Any = None


@dataclass
class AgentModelRequest:
    agent_id: str
    messages: List[AgentMessage]
    tools: List[AgentTool]
    model: Optional[str] = None
    instructions: Optional[str] = None
    context: Any = None


@dataclass
class AgentModelResponse:
    message: AgentMessage
    usage: Optional[Dict[str, Any]] = None
    request_id: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    response_meta: Optional[Dict[str, Any]] = None


@dataclass
class AgentDefinition:
    id: str
    model: Optional[str] = None
    preset: Optional[str] = None
    instructions: Optional[str] = None
    tools: List[AgentTool] = field(default_factory=list)
    max_steps: int = 8
    parse_output: Optional[Callable[[str], Any]] = None


@dataclass
class AgentStepRecord:
    index: int
    tool_calls: List[AgentToolCall] = field(default_factory=list)
    request_id: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None


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


@dataclass
class AgentRunResult:
    run: AgentRunRecord
    steps: List[AgentStepRecord]
    output: Any
    messages: List[AgentMessage]


def define_tool(tool: AgentTool) -> AgentTool:
    return tool


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
    ):
        if client is None:
            options = client_options or {}
            api_key = options.get("api_key")
            if not api_key:
                raise ValueError("PHASEO_API_KEY is required")
            base_url = options.get("base_url")
            client = Phaseo(api_key=api_key, base_url=base_url) if base_url else Phaseo(api_key=api_key)
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

    def generate(self, request: AgentModelRequest) -> AgentModelResponse:
        payload: Dict[str, Any] = {
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
            "temperature": self._temperature,
            "max_output_tokens": self._max_output_tokens,
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
        }
        response = self._client.responses.create(payload)
        tool_calls = _extract_tool_calls(response)
        return AgentModelResponse(
            message=AgentMessage(
                role="assistant",
                content=_extract_assistant_text(response),
                tool_calls=tool_calls,
            ),
            usage=response.get("usage"),
            request_id=response.get("id"),
            provider=response.get("provider"),
            model=response.get("model"),
            response_meta=response.get("meta") if isinstance(response.get("meta"), dict) else None,
        )


def create_gateway_agent_client(**kwargs: Any) -> GatewayAgentClient:
    return GatewayAgentClient(**kwargs)


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
    ) -> AgentRunResult:
        run_id = str(uuid.uuid4())
        messages: List[AgentMessage] = []
        if self.definition.instructions:
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
            status="running",
            input=input,
            messages=messages,
        )
        steps: List[AgentStepRecord] = []
        effective_max_steps = max_steps or self.definition.max_steps or 8
        tools_by_id = {tool.id: tool for tool in self.definition.tools}

        for step_index in range(effective_max_steps):
            model_response = client.generate(
                AgentModelRequest(
                    agent_id=self.definition.id,
                    model=model or self.definition.model or _to_preset_alias(self.definition.preset),
                    instructions=self.definition.instructions,
                    messages=messages,
                    tools=self.definition.tools,
                    context=context,
                )
            )
            assistant_message = model_response.message
            messages.append(assistant_message)
            step = AgentStepRecord(
                index=step_index,
                tool_calls=list(assistant_message.tool_calls),
                request_id=model_response.request_id,
                provider=model_response.provider,
                model=model_response.model,
            )
            steps.append(step)

            if not assistant_message.tool_calls:
                output = (
                    self.definition.parse_output(assistant_message.content)
                    if self.definition.parse_output
                    else assistant_message.content
                )
                run.status = "completed"
                run.messages = messages
                run.result = output
                run.step_count = len(steps)
                return AgentRunResult(run=run, steps=steps, output=output, messages=messages)

            for tool_call in assistant_message.tool_calls:
                tool = tools_by_id.get(tool_call.name)
                if tool is None:
                    raise ValueError(f"Unknown tool '{tool_call.name}'")
                output = tool.execute(
                    tool_call.input,
                    AgentRuntimeContext(
                        run_id=run_id,
                        agent_id=self.definition.id,
                        step_index=step_index,
                        context=context,
                    ),
                )
                messages.append(
                    AgentMessage(
                        role="tool",
                        name=tool.id,
                        tool_call_id=tool_call.id,
                        content=output if isinstance(output, str) else json.dumps(output),
                    )
                )

        run.status = "failed"
        run.error = f"Agent exceeded max_steps={effective_max_steps}"
        run.messages = messages
        run.step_count = len(steps)
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
            max_steps=definition.get("max_steps", 8),
            parse_output=definition.get("parse_output"),
        )
    )

