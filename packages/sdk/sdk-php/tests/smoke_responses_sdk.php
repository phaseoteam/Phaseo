<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/index.php";

use AIStats\Sdk\AIStats;
use AIStats\Sdk\Devtools;

$apiKey = getenv("AI_STATS_API_KEY");
if (!$apiKey) {
    throw new RuntimeException("AI_STATS_API_KEY is required");
}

$baseUrl = getenv("AI_STATS_BASE_URL") ?: "https://api.phaseo.app/v1";
$model = getenv("AI_STATS_SMOKE_MODEL") ?: "openai/gpt-5-nano";
$input = getenv("AI_STATS_SMOKE_INPUT") ?: "Hi";
$maxOutputTokensRaw = getenv("AI_STATS_SMOKE_MAX_OUTPUT_TOKENS");
$maxOutputTokens = is_string($maxOutputTokensRaw) && ctype_digit($maxOutputTokensRaw)
    ? (int) $maxOutputTokensRaw
    : 32;

$client = new AIStats(
    apiKey: $apiKey,
    basePath: $baseUrl,
    enableDeprecationWarnings: false,
    devtools: Devtools::create()
);

$response = $client->createResponse([
    "model" => $model,
    "input" => $input,
    "max_output_tokens" => $maxOutputTokens,
]);

if (is_object($response)) {
    $response = json_decode(json_encode($response, JSON_INVALID_UTF8_SUBSTITUTE), true);
}
if (!is_array($response)) {
    throw new RuntimeException("Expected array response, got " . get_debug_type($response));
}
if (!isset($response["id"])) {
    throw new RuntimeException("Missing response id");
}

echo json_encode($response, JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE) . PHP_EOL;
