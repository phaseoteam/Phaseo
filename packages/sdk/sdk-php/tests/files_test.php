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

final class FakeFilesClient extends \Phaseo\Gen\Client
{
    public array $calls = [];
    public ?Throwable $error = null;

    public function __construct()
    {
        parent::__construct("https://example.test");
    }

    public function requestRaw(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null): string
    {
        $this->calls[] = [$method, $path, $query, $headers, $body];
        if ($this->error) {
            throw $this->error;
        }
        return "{\"ok\":true}\n";
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeFilesClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$uploaded = $client->uploadFile([
    "purpose" => "batch",
    "file" => "data:application/json;base64,eyJ0ZXN0Ijp0cnVlfQ==",
]);
assert_true(($uploaded["ok"] ?? null) === true, "expected upload helper to return decoded payload");
assert_true($fake->calls[0] === [
    "POST",
    "/files",
    null,
    null,
    [
        "purpose" => "batch",
        "file" => "data:application/json;base64,eyJ0ZXN0Ijp0cnVlfQ==",
    ],
], "expected uploadFile to call POST /files");

$content = $client->retrieveFileContent("file_123");
assert_true($content === "{\"ok\":true}\n", "expected raw file content bytes");
assert_true($fake->calls[1] === ["GET", "/files/file_123/content", null, null, null], "expected requestRaw to be called for file content");

$fake->error = new \Phaseo\Gen\RequestException(404, "{\"error\":\"not found\"}");
try {
    $client->retrieveFileContent("file_missing_123");
    throw new RuntimeException("expected RequestException to be thrown");
} catch (\Phaseo\Gen\RequestException $error) {
    assert_true($error->getStatusCode() === 404, "expected RequestException status code");
}

echo "php files tests ok" . PHP_EOL;
