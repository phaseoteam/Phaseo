<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/AgentSdk.php";

use AIStats\AgentSdk\Agent;
use AIStats\AgentSdk\AgentDefinition;
use AIStats\AgentSdk\AgentSdk;
use AIStats\AgentSdk\Message;
use AIStats\AgentSdk\ModelClient;
use AIStats\AgentSdk\ModelRequest;
use AIStats\AgentSdk\ModelResponse;
use AIStats\AgentSdk\RuntimeContext;
use AIStats\AgentSdk\Tool;
use AIStats\AgentSdk\ToolCall;

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

final class FakeModelClient implements ModelClient
{
    private int $turn = 0;

    public function generate(ModelRequest $request): ModelResponse
    {
        if ($this->turn === 0) {
            $this->turn++;
            return new ModelResponse(
                message: new Message(
                    role: "assistant",
                    content: "",
                    toolCalls: [
                        new ToolCall(
                            id: "call_weather",
                            name: "get_weather",
                            input: ["city" => "London"]
                        ),
                    ]
                ),
                requestId: "req_tool"
            );
        }

        return new ModelResponse(
            message: new Message(
                role: "assistant",
                content: "Weather for London: Sunny."
            ),
            requestId: "req_final"
        );
    }
}

$tool = AgentSdk::defineTool(
    new Tool(
        id: "get_weather",
        description: "Look up weather by city",
        parameters: [
            "type" => "object",
            "properties" => ["city" => ["type" => "string"]],
            "required" => ["city"],
        ],
        execute: static function (mixed $input, RuntimeContext $context): array {
            assert_true(($input["city"] ?? null) === "London", "expected tool input to be parsed");
            assert_true($context->stepIndex === 0, "expected runtime context step index");
            return ["city" => "London", "weather" => "Sunny"];
        }
    )
);

$agent = AgentSdk::createAgent(
    new AgentDefinition(
        id: "weather-agent",
        model: "openai/gpt-5.4-nano",
        instructions: "Use tools when helpful.",
        tools: [$tool]
    )
);

$result = $agent->run(
    input: "What is the weather in London?",
    client: new FakeModelClient()
);

assert_true($result->run->status === "completed", "expected completed status");
assert_true($result->run->stepCount === 2, "expected two steps");
assert_true($result->output === "Weather for London: Sunny.", "expected final output");
assert_true(count($result->messages) === 5, "expected system, user, assistant, tool, assistant sequence");
assert_true($result->steps[0]->requestId === "req_tool", "expected first request id");
assert_true($result->steps[1]->requestId === "req_final", "expected second request id");

echo "php agent sdk tests ok" . PHP_EOL;
