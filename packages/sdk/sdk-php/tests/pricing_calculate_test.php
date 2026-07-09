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

final class FakePricingCalculateClient extends \Phaseo\Gen\Client
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
            "pricing" => [
                "total_cost_usd" => 0.00025,
                "currency" => "USD",
            ],
        ];
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.ai/v1",
    enableDeprecationWarnings: false
);

$fake = new FakePricingCalculateClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$payload = [
    "provider" => "openai",
    "model" => "openai/gpt-5-mini",
    "endpoint" => "responses",
    "usage" => ["input_tokens" => 1000],
];

$response = $client->calculatePricing($payload);
assert_true(($response["ok"] ?? null) === true, "expected ok payload");
assert_true(($response["pricing"]["total_cost_usd"] ?? null) === 0.00025, "expected pricing");
assert_true($fake->calls === [
    ["POST", "/pricing/calculate", null, null, $payload],
], "expected request call for pricing calculation");

echo "php pricing calculate tests ok" . PHP_EOL;
