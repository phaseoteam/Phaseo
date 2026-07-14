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

final class FakeModelsClient extends \Phaseo\Gen\Client
{
    public array $calls = [];

    public function __construct()
    {
        parent::__construct("https://example.test");
    }

    public function request(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null)
    {
        $this->calls[] = [$method, $path, $query, $headers, $body];
        return [
            "ok" => true,
            "availability_mode" => "all",
            "models" => [
                [
                    "id" => "openai/gpt-5-mini",
                    "providers" => [
                        [
                            "api_provider_id" => "openai",
                            "availability_status" => "coming_soon",
                            "availability_reason" => "scheduled",
                        ],
                    ],
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

$fake = new FakeModelsClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$response = $client->listModels(["availability" => "all"]);
assert_true(($response["availability_mode"] ?? null) === "all", "expected availability_mode");
assert_true(($response["models"][0]["providers"][0]["availability_status"] ?? null) === "coming_soon", "expected availability_status");
assert_true(($response["models"][0]["providers"][0]["availability_reason"] ?? null) === "scheduled", "expected availability_reason");
assert_true($fake->calls === [
    ["GET", "/models", ["availability" => "all"], null, null],
], "expected request call for models discovery");

echo "php models tests ok" . PHP_EOL;
