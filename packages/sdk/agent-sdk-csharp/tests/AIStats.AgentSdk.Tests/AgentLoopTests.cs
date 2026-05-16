using AiStatsAgentSdk;
using Xunit;

namespace AiStats.AgentSdk.Tests;

public class AgentLoopTests
{
    [Fact]
    public async Task AgentExecutesToolCallsAndReturnsFinalOutput()
    {
        var tool = global::AiStatsAgentSdk.AgentSdk.DefineTool(new Tool(
            Id: "get_weather",
            Description: "Look up weather by city",
            Parameters: new Dictionary<string, object?>
            {
                ["type"] = "object",
                ["properties"] = new Dictionary<string, object?>
                {
                    ["city"] = new Dictionary<string, object?> { ["type"] = "string" },
                },
                ["required"] = new[] { "city" },
            },
            Execute: (input, context) =>
            {
                var args = Assert.IsType<Dictionary<string, object?>>(input);
                Assert.Equal("London", args["city"]?.ToString());
                Assert.Equal(0, context.StepIndex);
                return Task.FromResult<object?>(new Dictionary<string, object?>
                {
                    ["city"] = "London",
                    ["weather"] = "Sunny",
                });
            }
        ));

        var agent = global::AiStatsAgentSdk.AgentSdk.CreateAgent(new AgentDefinition
        {
            Id = "weather-agent",
            Model = "openai/gpt-5.4-nano",
            Instructions = "Use tools when helpful.",
            Tools = new[] { tool },
        });

        var result = await agent.Run(new RunOptions
        {
            Input = "What is the weather in London?",
            Client = new FakeModelClient(),
        });

        Assert.Equal("completed", result.Run.Status);
        Assert.Equal(2, result.Run.StepCount);
        Assert.Equal("Weather for London: Sunny.", Assert.IsType<string>(result.Output));
        Assert.Equal("req_tool", result.Steps[0].RequestId);
        Assert.Equal("req_final", result.Steps[1].RequestId);
        Assert.Equal(5, result.Messages.Count);
    }

    private sealed class FakeModelClient : IModelClient
    {
        private int _turn;

        public Task<ModelResponse> Generate(ModelRequest request)
        {
            if (_turn++ == 0)
            {
                return Task.FromResult(new ModelResponse(
                    Message: new Message(
                        Role: "assistant",
                        Content: string.Empty,
                        ToolCalls: new[]
                        {
                            new ToolCall("call_weather", "get_weather", new Dictionary<string, object?>
                            {
                                ["city"] = "London",
                            }),
                        }
                    ),
                    RequestId: "req_tool"
                ));
            }

            return Task.FromResult(new ModelResponse(
                Message: new Message("assistant", "Weather for London: Sunny."),
                RequestId: "req_final"
            ));
        }
    }
}
