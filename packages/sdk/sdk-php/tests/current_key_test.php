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

final class FakeCurrentKeyClient extends \Phaseo\Gen\Client
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
                "prefix" => "phaseo_v1_sk_test",
                "status" => "active",
            ],
        ];
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeCurrentKeyClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$response = $client->getCurrentApiKey();
assert_true(($response["data"]["id"] ?? null) === "key_123", "expected current key id");
assert_true(($response["data"]["status"] ?? null) === "active", "expected current key status");
assert_true($fake->calls === [
    ["GET", "/key", null, null, null],
], "expected request call for current key lookup");

echo "php current key tests ok" . PHP_EOL;
