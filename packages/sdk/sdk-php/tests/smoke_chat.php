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

$response = \AIStats\Gen\createChatCompletion($client, null, null, null, [
    "model" => "openai/gpt-5-nano-2025-08-07",
    "messages" => [
        ["role" => "user", "content" => "Hi"]
    ]
]);

echo json_encode($response, JSON_PRETTY_PRINT) . PHP_EOL;
