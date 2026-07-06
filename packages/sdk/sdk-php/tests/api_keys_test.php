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

final class FakeApiKeysClient extends \Phaseo\Gen\Client
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
            "object" => "list",
            "data" => [
                ["id" => "key_123", "status" => "active"],
                ["id" => "key_456", "status" => "disabled"],
            ],
        ];
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeApiKeysClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$response = $client->listApiKeys(["disabled" => "true", "limit" => "2"]);
assert_true(($response["object"] ?? null) === "list", "expected list payload");
assert_true(($response["data"][0]["id"] ?? null) === "key_123", "expected first key id");
assert_true(($response["data"][1]["status"] ?? null) === "disabled", "expected second key status");
assert_true($fake->calls === [
    ["GET", "/keys", ["disabled" => "true", "limit" => "2"], null, null],
], "expected request call for api keys listing");

echo "php api keys tests ok" . PHP_EOL;
