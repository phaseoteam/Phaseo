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

final class FakeProviderOpsClient extends \Phaseo\Gen\Client
{
    public array $calls = [];

    public function __construct()
    {
        parent::__construct("https://example.test");
    }

    public function request(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null)
    {
        $this->calls[] = [$method, $path, $query, $headers, $body];
        return match ($path) {
            "/providers" => ["ok" => true, "providers" => [["provider_id" => "openai", "name" => "OpenAI"]]],
            "/credits" => ["ok" => true, "credits" => ["balance_usd" => 42.5]],
            "/activity" => ["ok" => true, "total" => 1, "activity" => [["request_id" => "req_123"]]],
            "/analytics" => ["data" => [["date" => "2026-05-01", "endpoint_id" => "responses", "requests" => 12]]],
            default => throw new RuntimeException("Unexpected request"),
        };
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.ai/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeProviderOpsClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$providers = $client->listProviders(["limit" => "2"]);
$credits = $client->getCredits(["team_id" => "team_123"]);
$activity = $client->getActivity(["days" => "30"]);
$analytics = $client->getAnalytics(["date" => "2026-05-01"]);

assert_true(($providers["providers"][0]["provider_id"] ?? null) === "openai", "expected provider id");
assert_true(($credits["credits"]["balance_usd"] ?? null) === 42.5, "expected credits balance");
assert_true(($activity["activity"][0]["request_id"] ?? null) === "req_123", "expected activity request id");
assert_true(($analytics["data"][0]["endpoint_id"] ?? null) === "responses", "expected analytics endpoint id");
assert_true($fake->calls === [
    ["GET", "/providers", ["limit" => "2"], null, null],
    ["GET", "/credits", ["team_id" => "team_123"], null, null],
    ["GET", "/activity", ["days" => "30"], null, null],
    ["GET", "/analytics", ["date" => "2026-05-01"], null, null],
], "expected provider and usage helper request calls");

echo "php provider ops tests ok" . PHP_EOL;
