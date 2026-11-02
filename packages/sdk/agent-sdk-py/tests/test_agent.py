from phaseo_agent import (
    AgentDevtoolsConfig,
    AgentHumanReviewRequest,
    AgentMessage,
    AgentModelRetryConfig,
    AgentModelResponse,
    AgentTool,
    AgentToolCall,
    AgentToolExecutionConfig,
    create_agent,
)


def test_live_luna_gateway_stream_when_enabled():
    import os
    import pytest
    from phaseo_agent import AgentModelRequest, AgentMessage, create_gateway_agent_client

    if os.getenv("PHASEO_AGENT_LIVE_SMOKE") != "true":
        pytest.skip("live Agent SDK smoke is opt-in")
    api_key = os.getenv("PHASEO_API_KEY")
    if not api_key:
        pytest.skip("PHASEO_API_KEY is unavailable")
    client = create_gateway_agent_client(client_options={"api_key": api_key}, model="openai/gpt-5.6-luna", include_meta=True)
    events = list(client.stream(AgentModelRequest("live-smoke", [AgentMessage("user", "Reply with exactly: luna-ok")], [])))
    assert any(event["type"] == "response.output_text.delta" for event in events)
    completed = next(event["response"] for event in events if event["type"] == "response.completed")
    assert completed.request_id or completed.native_response_id


def test_advanced_tool_and_continuation_contract():
    from phaseo_agent import AgentToolDecision, AgentToolOutput, max_cost

    events = []
    requests = []
    executed = []

    class Client:
        def generate(self, request):
            requests.append(request)
            if len(requests) == 1:
                return AgentModelResponse(
                    AgentMessage("assistant", "", [
                        AgentToolCall("auto", "progress", {"value": 2}),
                        AgentToolCall("gate", "gated", {}),
                        AgentToolCall("manual", "manual", {}),
                        AgentToolCall("failure", "failure", {}),
                    ]), cost=1, usage={"input_tokens": 2, "output_tokens": 1})
            return AgentModelResponse(AgentMessage("assistant", "done"), cost=1)

    def progress_tool(value, runtime):
        runtime.emit_progress({"percent": 50})
        runtime.set_context({"model": "second"})
        executed.append("auto")
        return {"result": value["value"] * 2}

    agent = create_agent({
        "id": "advanced",
        "model": lambda turn: turn["context"]["model"],
        "instructions": lambda turn: f"turn:{turn['number_of_turns']}",
        "stop_when": max_cost(2),
        "tools": [
            AgentTool("progress", progress_tool, input_schema=lambda value: value if value["value"] == 2 else (_ for _ in ()).throw(ValueError("bad")), output_schema=lambda value: value, next_turn_params={"temperature": 0.2}),
            AgentTool("gated", lambda _value, _runtime: executed.append("gate") or "approved", require_approval=True),
            AgentTool("manual"),
            AgentTool("failure", lambda _value, _runtime: (_ for _ in ()).throw(RuntimeError("expected")), on_error="return-to-model"),
        ],
    })
    paused = agent.run(input="run", client=Client(), context={"model": "first"}, on_event=events.append)
    assert executed == ["auto"]
    assert [item.call.id for item in paused.run.pause.pending_tool_calls] == ["gate", "manual"]
    result = agent.continue_run(run=paused, client=Client(), approvals=[AgentToolDecision("gate")], tool_outputs=[AgentToolOutput("manual", "external")])
    assert executed == ["auto", "gate"]
    assert result.run.status == "stopped"
    assert result.usage.cost == 2
    assert requests[0].model == "first"
    assert requests[1].model == "second" and requests[1].temperature == 0.2
    assert any(event["type"] == "tool.preliminary_result" for event in events)


def test_stream_is_replayable_and_state_accessor_loads_by_id():
    class StreamingClient:
        def generate(self, request):
            return AgentModelResponse(AgentMessage("assistant", "fallback"))
        def stream(self, request):
            yield {"type": "response.output_text.delta", "delta": "hel"}
            yield {"type": "response.output_text.delta", "delta": "lo"}
            yield {"type": "response.completed", "response": AgentModelResponse(AgentMessage("assistant", "hello"))}
    saved = {}
    class State:
        def load(self, run_id): return saved.get(run_id)
        def save(self, result): saved[result.run.id] = result
    agent = create_agent({"id": "stream"})
    stream = agent.stream(input="run", client=StreamingClient(), state=State())
    assert "".join(stream.text_stream()) == "hello"
    result = stream.result()
    assert result.output == "hello" and saved[result.run.id].output == "hello"


class FakeClient:
    def __init__(self):
        self.calls = 0

    def generate(self, request):
        self.calls += 1
        if self.calls == 1:
            return AgentModelResponse(
                message=AgentMessage(
                    role="assistant",
                    content="",
                    tool_calls=[
                        AgentToolCall(
                            id="call_1",
                            name="lookup",
                            input={"slug": "presets"},
                        )
                    ],
                )
            )
        return AgentModelResponse(
            message=AgentMessage(
                role="assistant",
                content="Presets let you define stable routing defaults.",
            )
        )


def test_agent_executes_tool_loop():
    agent = create_agent(
        {
            "id": "support-agent",
            "instructions": "Use tools when helpful.",
            "tools": [
                AgentTool(
                    id="lookup",
                    description="Lookup docs",
                    parameters={"type": "object"},
                    execute=lambda input, _ctx: {"slug": input["slug"], "ok": True},
                )
            ],
        }
    )

    result = agent.run(
        input="Explain presets",
        client=FakeClient(),
    )

    assert result.output == "Presets let you define stable routing defaults."
    assert len(result.steps) == 2
    assert result.messages[-2].role == "tool"


def test_agent_retries_emits_events_pauses_and_resumes(tmp_path):
    events = []

    class ReviewClient:
        def __init__(self):
            self.calls = 0

        def generate(self, request):
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("temporary gateway failure")
            return AgentModelResponse(
                message=AgentMessage(role="assistant", content="Deploy the change")
            )

    agent = create_agent({
        "id": "review-agent",
        "model_retry": AgentModelRetryConfig(max_retries=1, backoff_ms=0),
        "tool_execution": AgentToolExecutionConfig(tool_concurrency=2),
        "human_review": lambda ctx: (
            AgentHumanReviewRequest("Approve deployment", {"output": ctx.response.message.content})
            if not any(message.role == "user" and message.content == "approved" for message in ctx.messages)
            else None
        ),
    })
    client = ReviewClient()
    paused = agent.run(
        input="Prepare deployment",
        client=client,
        on_event=events.append,
        devtools=AgentDevtoolsConfig(directory=str(tmp_path)),
    )

    assert paused.run.status == "waiting_for_human"
    assert paused.run.pause.reason == "Approve deployment"
    assert paused.steps[0].model_attempts == 2

    resumed = agent.continue_run(
        run=paused,
        client=client,
        human_input="approved",
        on_event=events.append,
        devtools=AgentDevtoolsConfig(directory=str(tmp_path)),
    )
    assert resumed.run.status == "completed"
    assert resumed.output == "Deploy the change"
    assert {event["type"] for event in events} >= {
        "run.started", "run.waiting_for_human", "run.resumed", "run.completed"
    }
    assert len((tmp_path / "generations.jsonl").read_text().splitlines()) == 2


def test_gateway_client_passes_an_api_key_function_to_the_core_client(monkeypatch):
    import httpx

    from phaseo_agent import create_gateway_agent_client

    seen: list[str | None] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("authorization"))
        return httpx.Response(200, json={"data": {"id": "key_123"}}, request=request)

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", handle)
    issued = iter(["workload-token-1", "workload-token-2"])
    client = create_gateway_agent_client(client_options={"api_key": lambda: next(issued), "base_url": "https://example.test/v1"}, model="openai/gpt-5-mini")

    client._client.get_current_api_key()
    client._client.get_current_api_key()

    assert seen == ["Bearer workload-token-1", "Bearer workload-token-2"]
