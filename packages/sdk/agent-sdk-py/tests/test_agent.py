from ai_stats_agent import (
    AgentMessage,
    AgentModelResponse,
    AgentTool,
    AgentToolCall,
    create_agent,
)


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
