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

final class FakeWorkspacesClient extends \Phaseo\Gen\Client
{
    public array $calls = [];

    public function __construct()
    {
        parent::__construct("https://example.test");
    }

    public function request(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null)
    {
        $this->calls[] = [$method, $path, $query, $headers, $body];
        if ($path === "/workspaces") {
            return [
                "object" => "list",
                "data" => [
                    ["id" => "ws_123", "slug" => "default"],
                    ["id" => "ws_456", "slug" => "sandbox"],
                ],
            ];
        }

        return [
            "data" => [
                "id" => "ws_123",
                "slug" => "default",
                "name" => "Default Workspace",
            ],
        ];
    }
}

$client = new Phaseo(
    apiKey: "test",
    basePath: "https://api.phaseo.ai/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeWorkspacesClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$listed = $client->listWorkspaces(["limit" => "2", "offset" => "3"]);
$retrieved = $client->getWorkspace("ws_123");

assert_true(($listed["object"] ?? null) === "list", "expected workspaces list payload");
assert_true(($listed["data"][1]["slug"] ?? null) === "sandbox", "expected second workspace slug");
assert_true(($retrieved["data"]["id"] ?? null) === "ws_123", "expected workspace id");
assert_true(($retrieved["data"]["name"] ?? null) === "Default Workspace", "expected workspace name");
assert_true($fake->calls === [
    ["GET", "/workspaces", ["limit" => "2", "offset" => "3"], null, null],
    ["GET", "/workspaces/ws_123", null, null, null],
], "expected request calls for workspace list and lookup");

echo "php workspaces tests ok" . PHP_EOL;
