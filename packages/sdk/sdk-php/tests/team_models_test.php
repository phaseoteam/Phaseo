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

final class FakeTeamModelsClient extends \AIStats\Gen\Client
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
            "limit" => 2,
            "models" => [
                ["id" => "openai/gpt-5-mini", "endpoints" => ["responses"]],
            ],
        ];
    }
}

$client = new AIStats(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeTeamModelsClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$response = $client->listTeamModels(["limit" => "2", "endpoints" => "responses"]);
assert_true(($response["ok"] ?? null) === true, "expected ok payload");
assert_true(($response["models"][0]["id"] ?? null) === "openai/gpt-5-mini", "expected team model id");
assert_true($fake->calls === [
    ["GET", "/models", ["limit" => "2", "endpoints" => "responses"], null, null],
], "expected request call for team models discovery");

echo "php team models tests ok" . PHP_EOL;
