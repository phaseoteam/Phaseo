require "minitest/autorun"
require_relative "../lib/phaseo_agent_sdk"

class FakeClient
  def initialize
    @calls = 0
  end

  def generate(_request)
    @calls += 1
    if @calls == 1
      PhaseoAgentSdk::ModelResponse.new(
        message: PhaseoAgentSdk::Message.new(
          role: "assistant",
          content: "",
          tool_calls: [
            PhaseoAgentSdk::ToolCall.new(id: "call_1", name: "lookup", input: { "slug" => "presets" })
          ]
        )
      )
    else
      PhaseoAgentSdk::ModelResponse.new(
        message: PhaseoAgentSdk::Message.new(
          role: "assistant",
          content: "Presets let you define stable routing defaults."
        )
      )
    end
  end
end

class AgentLoopTest < Minitest::Test
  def test_agent_executes_tool_loop
    agent = PhaseoAgentSdk.create_agent(
      id: "support-agent",
      instructions: "Use tools when helpful.",
      tools: [
        PhaseoAgentSdk.define_tool(
          PhaseoAgentSdk::Tool.new(
            id: "lookup",
            description: "Lookup docs",
            parameters: { type: "object" },
            execute: lambda { |input, _ctx| { slug: input["slug"], ok: true } }
          )
        )
      ]
    )

    result = agent.run(
      input: "Explain presets",
      client: FakeClient.new
    )

    assert_equal "Presets let you define stable routing defaults.", result.output
    assert_equal 2, result.steps.length
    assert_equal "tool", result.messages[-2].role
  end
end
