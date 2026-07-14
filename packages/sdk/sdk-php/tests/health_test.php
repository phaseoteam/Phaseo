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

final class FakeHealthClient extends \Phaseo\Gen\Client
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
            "status" => "ok",
            "timestamp" => "2026-05-05T12:00:00.000Z",
        ];
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeHealthClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$response = $client->health();
assert_true(($response["status"] ?? null) === "ok", "expected health status");
assert_true(($response["timestamp"] ?? null) === "2026-05-05T12:00:00.000Z", "expected health timestamp");
assert_true($fake->calls === [
    ["GET", "/health", null, null, null],
], "expected request call for health lookup");

echo "php health tests ok" . PHP_EOL;
