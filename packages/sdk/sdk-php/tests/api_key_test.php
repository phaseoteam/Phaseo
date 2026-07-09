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

final class FakeApiKeyClient extends \Phaseo\Gen\Client
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
            "data" => [
                "id" => "key_123",
                "hash" => "keyhash_123",
                "status" => "active",
            ],
        ];
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.ai/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeApiKeyClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$response = $client->getApiKey("key_123");
assert_true(($response["data"]["id"] ?? null) === "key_123", "expected key id");
assert_true(($response["data"]["hash"] ?? null) === "keyhash_123", "expected key hash");
assert_true(($response["data"]["status"] ?? null) === "active", "expected key status");
assert_true($fake->calls === [
    ["GET", "/keys/key_123", null, null, null],
], "expected request call for api key lookup");

echo "php api key tests ok" . PHP_EOL;
