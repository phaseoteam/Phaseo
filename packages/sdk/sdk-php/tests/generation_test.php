<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/index.php";

use AIStats\Sdk\AIStats;

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

final class FakeGenerationClient extends \AIStats\Gen\Client
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
            "id" => "gen_123",
            "provider" => "openai",
            "request_id" => "req_php_generation_1",
            "status_code" => 200,
        ];
    }
}

$client = new AIStats(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeGenerationClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$response = $client->getGeneration("gen_123");
assert_true(($response["id"] ?? null) === "gen_123", "expected generation id");
assert_true(($response["provider"] ?? null) === "openai", "expected provider");
assert_true(($response["request_id"] ?? null) === "req_php_generation_1", "expected request_id");
assert_true($fake->calls === [
    ["GET", "/generations", ["id" => "gen_123"], null, null],
], "expected request call for generation lookup");

echo "php generation tests ok" . PHP_EOL;
