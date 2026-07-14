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

final class FakeApiKeyMutationsClient extends \Phaseo\Gen\Client
{
    public array $calls = [];

    public function __construct()
    {
        parent::__construct("https://example.test");
    }

    public function request(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null)
    {
        $this->calls[] = [$method, $path, $query, $headers, $body];
        return match ([$method, $path]) {
            ["POST", "/keys"] => ["data" => ["id" => "key_123", "name" => "Admin Key", "status" => "active"]],
            ["PATCH", "/keys/key_123"] => ["data" => ["id" => "key_123", "name" => "Renamed Key", "status" => "disabled"]],
            ["DELETE", "/keys/key_123"] => ["data" => ["id" => "key_123", "deleted" => true]],
            default => throw new RuntimeException("Unexpected request"),
        };
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeApiKeyMutationsClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$created = $client->createApiKey(["name" => "Admin Key", "scopes" => ["gateway:read"]]);
$updated = $client->updateApiKey("key_123", ["name" => "Renamed Key", "disabled" => true]);
$deleted = $client->deleteApiKey("key_123");

assert_true(($created["data"]["status"] ?? null) === "active", "expected created key status");
assert_true(($updated["data"]["status"] ?? null) === "disabled", "expected updated key status");
assert_true(($deleted["data"]["deleted"] ?? null) === true, "expected deleted key payload");
assert_true($fake->calls === [
    ["POST", "/keys", null, null, ["name" => "Admin Key", "scopes" => ["gateway:read"]]],
    ["PATCH", "/keys/key_123", null, null, ["name" => "Renamed Key", "disabled" => true]],
    ["DELETE", "/keys/key_123", null, null, null],
], "expected request call sequence for api key mutations");

echo "php api key mutation tests ok" . PHP_EOL;
