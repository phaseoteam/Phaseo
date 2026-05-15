require "minitest/autorun"
require_relative "../lib/ai_stats_agent_sdk"

class FakeClient
  def initialize
    @calls = 0
  end

  def generate(_request)
    @calls += 1
    if @calls == 1
      AIStatsAgentSdk::ModelResponse.new(
        message: AIStatsAgentSdk::Message.new(
          role: "assistant",
          content: "",
          tool_calls: [
            AIStatsAgentSdk::ToolCall.new(id: "call_1", name: "lookup", input: { "slug" => "presets" })
          ]
        )
      )
    else
      AIStatsAgentSdk::ModelResponse.new(
        message: AIStatsAgentSdk::Message.new(
          role: "assistant",
          content: "Presets let you define stable routing defaults."
        )
      )
    end
  end
end

class AgentLoopTest < Minitest::Test
  def test_agent_executes_tool_loop
    agent = AIStatsAgentSdk.create_agent(
      id: "support-agent",
      instructions: "Use tools when helpful.",
      tools: [
        AIStatsAgentSdk.define_tool(
          AIStatsAgentSdk::Tool.new(
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
