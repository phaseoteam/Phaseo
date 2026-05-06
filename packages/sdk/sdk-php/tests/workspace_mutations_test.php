<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/index.php";

use AIStats\Sdk\AIStats;

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

final class FakeWorkspaceMutationsClient extends \AIStats\Gen\Client
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
            ["POST", "/workspaces"] => ["data" => ["id" => "ws_123", "slug" => "sandbox", "name" => "Sandbox Workspace"]],
            ["PATCH", "/workspaces/ws_123"] => ["data" => ["id" => "ws_123", "slug" => "sandbox", "name" => "Renamed Workspace", "archived" => true]],
            ["DELETE", "/workspaces/ws_123"] => ["data" => ["id" => "ws_123", "deleted" => true]],
            default => throw new RuntimeException("Unexpected request"),
        };
    }
}

$client = new AIStats(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeWorkspaceMutationsClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$created = $client->createWorkspace(["name" => "Sandbox Workspace", "slug" => "sandbox"]);
$updated = $client->updateWorkspace("ws_123", ["name" => "Renamed Workspace", "archived" => true]);
$deleted = $client->deleteWorkspace("ws_123");

assert_true(($created["data"]["slug"] ?? null) === "sandbox", "expected created workspace slug");
assert_true(($updated["data"]["archived"] ?? null) === true, "expected updated workspace archived flag");
assert_true(($deleted["data"]["deleted"] ?? null) === true, "expected deleted workspace payload");
assert_true($fake->calls === [
    ["POST", "/workspaces", null, null, ["name" => "Sandbox Workspace", "slug" => "sandbox"]],
    ["PATCH", "/workspaces/ws_123", null, null, ["name" => "Renamed Workspace", "archived" => true]],
    ["DELETE", "/workspaces/ws_123", null, null, null],
], "expected request call sequence for workspace mutations");

echo "php workspace mutation tests ok" . PHP_EOL;
