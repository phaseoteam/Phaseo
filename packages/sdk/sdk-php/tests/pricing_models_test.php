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

final class FakePricingModelsClient extends \Phaseo\Gen\Client
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
            "models" => [
                [
                    "provider" => "openai",
                    "model" => "openai/gpt-5-mini",
                    "endpoint" => "responses",
                    "display_name" => "GPT-5 Mini",
                    "meters" => [
                        [
                            "meter" => "input_tokens",
                            "unit" => "tokens",
                            "unit_size" => 1000,
                            "price_per_unit" => "0.00025",
                            "currency" => "USD",
                        ],
                    ],
                ],
            ],
        ];
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.ai/v1",
    enableDeprecationWarnings: false
);

$fake = new FakePricingModelsClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$response = $client->listPricingModels(["provider" => "openai"]);
assert_true(($response["ok"] ?? null) === true, "expected ok payload");
assert_true(($response["models"][0]["provider"] ?? null) === "openai", "expected provider");
assert_true($fake->calls === [
    ["GET", "/pricing/models", ["provider" => "openai"], null, null],
], "expected request call for pricing models discovery");

echo "php pricing models tests ok" . PHP_EOL;
