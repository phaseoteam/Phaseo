<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/gen/Client.php";
require_once __DIR__ . "/../src/gen/Operations.php";

$apiKey = getenv("AI_STATS_API_KEY");
if (!$apiKey) {
    throw new RuntimeException("AI_STATS_API_KEY is required");
}

$baseUrl = getenv("AI_STATS_BASE_URL") ?: "https://api.phaseo.app/v1";
$client = new \AIStats\Gen\Client($baseUrl, ["Authorization" => "Bearer " . $apiKey]);

$response = \AIStats\Gen\createResponse($client, null, null, null, [
    "model" => "openai/gpt-5-nano",
    "input" => "Hi"
]);

if (is_string($response)) {
    $decoded = json_decode($response, true);
    if (is_array($decoded)) {
        $response = $decoded;
    }
}

if (is_object($response)) {
    $decoded = json_decode(json_encode($response, JSON_INVALID_UTF8_SUBSTITUTE), true);
    if (is_array($decoded)) {
        $response = $decoded;
    }
}

if (!is_array($response)) {
    throw new RuntimeException("Expected array response from /responses, got " . get_debug_type($response));
}

if (!isset($response["id"])) {
    throw new RuntimeException("Missing response id");
}

if (!isset($response["usage"])) {
    throw new RuntimeException("Missing usage block");
}

$summary = [
    "id" => $response["id"],
    "model" => $response["model"] ?? null,
    "status" => $response["status"] ?? null,
    "usage_total_tokens" => $response["usage"]["total_tokens"] ?? null,
];

echo json_encode($summary, JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE) . PHP_EOL;
