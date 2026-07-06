<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/index.php";

use Phaseo\Sdk\Phaseo;

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

final class FakeChatClient extends \Phaseo\Gen\Client
{
    public array $calls = [];

    public function __construct()
    {
        parent::__construct("https://example.test");
    }

    public function request(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null)
    {
        $this->calls[] = [$method, $path, $query, $headers, $body];
        if ($method === "GET" && $path === "/models") {
            return [
                "models" => [
                    [
                        "model_id" => "openai/gpt-5-nano",
                        "status" => "active",
                    ],
                ],
            ];
        }
        return [
            "id" => "req_php_chat_1",
            "nativeResponseId" => "chatcmpl_php_1",
            "object" => "chat.completion",
            "created" => 1723000000,
            "model" => "openai/gpt-5-nano",
            "provider" => "openai",
            "session_id" => "session_php_chat_1",
            "upstream_request_id" => "upstream_php_chat_1",
            "provider_attempts" => [
                ["provider" => "openai", "status_code" => 200, "duration_ms" => 412],
            ],
            "pricing_lines" => [
                ["provider" => "openai", "cost_usd" => 0.0025],
            ],
            "usage" => [
                "input_tokens" => 2,
                "output_tokens" => 1,
                "total_tokens" => 3,
            ],
            "choices" => [
                [
                    "index" => 0,
                    "message" => ["role" => "assistant", "content" => "hi"],
                    "finish_reason" => "stop",
                ],
            ],
        ];
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeChatClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$response = $client->generateText([
    "model" => "openai/gpt-5-nano",
    "messages" => [
        ["role" => "user", "content" => "hi"],
    ],
]);

assert_true(($response["provider"] ?? null) === "openai", "expected provider metadata");
assert_true(($response["nativeResponseId"] ?? null) === "chatcmpl_php_1", "expected nativeResponseId metadata");
assert_true(($response["session_id"] ?? null) === "session_php_chat_1", "expected session_id metadata");
assert_true(($response["upstream_request_id"] ?? null) === "upstream_php_chat_1", "expected upstream_request_id metadata");
assert_true((($response["provider_attempts"][0]["provider"] ?? null) === "openai"), "expected provider_attempts metadata");
assert_true((($response["pricing_lines"][0]["provider"] ?? null) === "openai"), "expected pricing_lines metadata");
assert_true((($response["usage"]["input_tokens"] ?? null) === 2), "expected input_tokens usage");
assert_true((($response["usage"]["output_tokens"] ?? null) === 1), "expected output_tokens usage");
assert_true((($response["usage"]["total_tokens"] ?? null) === 3), "expected total_tokens usage");
assert_true($fake->calls === [
    [
        "GET",
        "/models",
        ["model_id" => "openai/gpt-5-nano", "limit" => "1"],
        null,
        null,
    ],
    [
        "POST",
        "/chat/completions",
        null,
        null,
        [
            "model" => "openai/gpt-5-nano",
            "messages" => [
                ["role" => "user", "content" => "hi"],
            ],
        ],
    ],
], "expected request call for chat completions");

echo "php chat tests ok" . PHP_EOL;
