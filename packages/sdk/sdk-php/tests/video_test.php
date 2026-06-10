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

final class FakeVideoClient extends \AIStats\Gen\Client
{
    public array $rawCalls = [];
    public array $calls = [];

    public function __construct()
    {
        parent::__construct("https://example.test");
    }

    public function requestRaw(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null): string
    {
        $this->rawCalls[] = [$method, $path, $query, $headers, $body];
        return "video-bytes";
    }

    public function request(string $method, string $path, ?array $query = null, ?array $headers = null, $body = null)
    {
        $this->calls[] = [$method, $path, $query, $headers, $body];
        if ($method === "GET" && $path === "/models") {
            return [
                "models" => [
                    [
                        "model_id" => "google/veo-3",
                        "status" => "active",
                    ],
                ],
            ];
        }
        if ($method === "POST" && $path === "/videos") {
            return [
                "id" => "video_123",
                "object" => "video",
                "status" => "queued",
                "provider" => "google",
                "request_id" => "req_php_video_1",
                "session_id" => "session_php_video_1",
                "pricing_lines" => [
                    ["dimension" => "video_seconds", "units" => 8],
                ],
            ];
        }
        if ($method === "GET" && $path === "/videos/video_123") {
            return [
                "id" => "video_123",
                "object" => "video",
                "status" => "completed",
                "provider" => "google",
                "request_id" => "req_php_video_1",
                "session_id" => "session_php_video_1",
                "pricing_lines" => [
                    ["dimension" => "video_seconds", "units" => 8],
                ],
            ];
        }
        if ($method === "POST" && $path === "/videos/video_123/cancel") {
            return [
                "id" => "video_123",
                "object" => "video",
                "status" => "cancelled",
            ];
        }
        if ($method === "DELETE" && $path === "/videos/video_123") {
            return [
                "id" => "video_123",
                "object" => "video",
                "deleted" => true,
            ];
        }
        if ($method === "GET" && $path === "/videos/models") {
            return [
                "object" => "list",
                "data" => [
                    ["id" => "google/veo-3"],
                ],
            ];
        }
        if ($method === "GET" && $path === "/videos") {
            return [
                "object" => "list",
                "data" => [
                    ["id" => "video_123", "status" => "queued"],
                    ["id" => "video_456", "status" => "completed"],
                ],
            ];
        }
        return [
            "download_url" => "https://cdn.example.test/video.mp4",
            "expires_at" => 1723000000,
        ];
    }
}

$client = new AIStats(
    apiKey: "test",
    basePath: "https://api.phaseo.app/v1",
    enableDeprecationWarnings: false
);

$fake = new FakeVideoClient();
$ref = new ReflectionClass($client);
$prop = $ref->getProperty("client");
$prop->setAccessible(true);
$prop->setValue($client, $fake);

$content = $client->retrieveVideoContent("video_123");
assert_true($content === "video-bytes", "expected raw video bytes");
assert_true($fake->rawCalls === [
    ["GET", "/videos/video_123/content", null, null, null],
], "expected requestRaw to be called for video content");

$response = $client->getVideoDownloadUrl("video_123", ["disposition" => "attachment"]);
assert_true(($response["download_url"] ?? null) === "https://cdn.example.test/video.mp4", "expected download_url");
assert_true(($response["expires_at"] ?? null) === 1723000000, "expected expires_at");
assert_true($fake->calls === [
    ["POST", "/videos/video_123/download_url", null, null, ["disposition" => "attachment"]],
], "expected request to be called for video download URL");

$created = $client->generateVideo([
    "model" => "google/veo-3",
    "prompt" => "orbiting camera shot",
]);
assert_true(($created["status"] ?? null) === "queued", "expected queued video create status");
assert_true(($created["provider"] ?? null) === "google", "expected create provider metadata");
assert_true(($created["request_id"] ?? null) === "req_php_video_1", "expected create request_id metadata");
assert_true(($created["session_id"] ?? null) === "session_php_video_1", "expected create session_id metadata");
assert_true((count($created["pricing_lines"] ?? [])) === 1, "expected create pricing_lines metadata");

$retrieved = $client->getVideo("video_123");
assert_true(($retrieved["status"] ?? null) === "completed", "expected completed video status");
assert_true(($retrieved["provider"] ?? null) === "google", "expected retrieve provider metadata");
assert_true(($retrieved["request_id"] ?? null) === "req_php_video_1", "expected retrieve request_id metadata");
assert_true(($retrieved["session_id"] ?? null) === "session_php_video_1", "expected retrieve session_id metadata");

$cancelled = $client->cancelVideo("video_123");
assert_true(($cancelled["status"] ?? null) === "cancelled", "expected cancelled video status");

$deleted = $client->deleteVideo("video_123");
assert_true(($deleted["deleted"] ?? null) === true, "expected deleted video response");

$models = $client->listVideoModels();
assert_true(($models["data"][0]["id"] ?? null) === "google/veo-3", "expected video model id");

$list = $client->listVideos(["status" => "queued,completed", "limit" => "2"]);
assert_true(($list["data"][1]["id"] ?? null) === "video_456", "expected second video id in list");
assert_true(
    $client->getVideoWebSocketUrl("video_123", 900) === "wss://api.phaseo.app/v1/async/video/video_123/ws?interval_ms=900",
    "expected video websocket URL"
);

echo "php video tests ok" . PHP_EOL;
