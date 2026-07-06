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

final class FakeBatchClient extends \Phaseo\Gen\Client
{
    public array $calls = [];
    public ?Throwable $error = null;

    public function __construct()
    {
        parent::__construct("https://example.test");
    }

    public function request(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null)
    {
        $this->calls[] = [$method, $path, $query, $headers, $body];
        if ($this->error) {
            throw $this->error;
        }
        return match ([$method, $path]) {
            ["POST", "/batches"] => ["id" => "batch_123", "status" => "validating", "provider" => "openai", "request_id" => "req_php_batch_1", "session_id" => "session_php_batch_1", "pricing_lines" => [["provider" => "openai", "cost_usd" => 0.03]]],
            ["GET", "/batches/batch_123"] => ["id" => "batch_123", "status" => "completed", "provider" => "openai", "request_id" => "req_php_batch_2", "session_id" => "session_php_batch_1", "request_counts" => ["total" => 4, "completed" => 3, "failed" => 1], "billing" => ["charged" => true, "cost_usd" => 0.12]],
            default => ["id" => "batch_123", "status" => "cancelling"],
        };
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.ai/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeBatchClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$createResponse = $client->createBatch([
    "input_file_id" => "file_123",
    "endpoint" => "/v1/responses",
    "completion_window" => "24h",
    "session_id" => "session_php_batch_1",
]);
assert_true(($createResponse["id"] ?? null) === "batch_123", "expected created batch id");
assert_true(($createResponse["status"] ?? null) === "validating", "expected validating status");
assert_true(($createResponse["provider"] ?? null) === "openai", "expected create provider");
assert_true(($createResponse["request_id"] ?? null) === "req_php_batch_1", "expected create request id");
assert_true(($createResponse["session_id"] ?? null) === "session_php_batch_1", "expected create session id");
assert_true(($createResponse["pricing_lines"][0]["provider"] ?? null) === "openai", "expected create pricing lines");

$retrieveResponse = $client->retrieveBatch("batch_123");
assert_true(($retrieveResponse["id"] ?? null) === "batch_123", "expected retrieved batch id");
assert_true(($retrieveResponse["status"] ?? null) === "completed", "expected completed status");
assert_true(($retrieveResponse["provider"] ?? null) === "openai", "expected retrieve provider");
assert_true(($retrieveResponse["request_id"] ?? null) === "req_php_batch_2", "expected retrieve request id");
assert_true(($retrieveResponse["session_id"] ?? null) === "session_php_batch_1", "expected retrieve session id");
assert_true(($retrieveResponse["request_counts"]["total"] ?? null) === 4, "expected retrieve request counts");
assert_true(($retrieveResponse["billing"]["charged"] ?? null) === true, "expected retrieve billing");

$response = $client->cancelBatch("batch_123");
assert_true(($response["id"] ?? null) === "batch_123", "expected batch id");
assert_true(($response["status"] ?? null) === "cancelling", "expected cancelling status");
assert_true(
    $client->getBatchWebSocketUrl("batch_123", 1500, false) === "wss://api.phaseo.ai/v1/async/batch/batch_123/ws?interval_ms=1500&close_on_terminal=false",
    "expected batch websocket URL"
);
assert_true(
    $client->getAsyncJobWebSocketUrl("video", "video 123", 1500, false) === "wss://api.phaseo.ai/v1/async/video/video%20123/ws?interval_ms=1500&close_on_terminal=false",
    "expected generic async job websocket URL"
);
assert_true($fake->calls === [
    ["POST", "/batches", null, null, [
        "input_file_id" => "file_123",
        "endpoint" => "/v1/responses",
        "completion_window" => "24h",
        "session_id" => "session_php_batch_1",
    ]],
    ["GET", "/batches/batch_123", null, null, null],
    ["POST", "/batches/batch_123/cancel", null, null, null],
], "expected batch helpers to call create/retrieve/cancel routes");

$fake->error = new \Phaseo\Gen\RequestException(404, "{\"error\":\"not found\"}");
try {
    $client->cancelBatch("batch_missing_123");
    throw new RuntimeException("expected RequestException to be thrown");
} catch (\Phaseo\Gen\RequestException $error) {
    assert_true($error->getStatusCode() === 404, "expected RequestException status code");
}

echo "php batches tests ok" . PHP_EOL;
