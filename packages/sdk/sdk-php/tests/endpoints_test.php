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

final class FakeEndpointsClient extends \Phaseo\Gen\Client
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
            "endpoints" => ["chat/completions", "responses", "files"],
            "sample_models" => ["openai/gpt-5-nano"],
        ];
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeEndpointsClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$response = $client->listEndpoints();
assert_true(($response["ok"] ?? null) === true, "expected ok payload");
assert_true(($response["sample_models"][0] ?? null) === "openai/gpt-5-nano", "expected sample model");
assert_true($fake->calls === [
    ["GET", "/endpoints", null, null, null],
], "expected request call for endpoints discovery");

echo "php endpoints tests ok" . PHP_EOL;
