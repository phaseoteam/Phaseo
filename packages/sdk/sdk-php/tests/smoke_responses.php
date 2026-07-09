<?php
declare(strict_types=1);

require_once __DIR__ . "/../src/gen/Client.php";
require_once __DIR__ . "/../src/gen/Operations.php";

$apiKey = getenv("PHASEO_API_KEY");
if (!$apiKey) {
    throw new RuntimeException("PHASEO_API_KEY is required");
}

$baseUrl = getenv("PHASEO_BASE_URL") ?: "https://api.phaseo.ai/v1";
$client = new \Phaseo\Gen\Client($baseUrl, ["Authorization" => "Bearer " . $apiKey]);
$model = getenv("PHASEO_SMOKE_MODEL") ?: "openai/gpt-5.4-nano";
$input = getenv("PHASEO_SMOKE_INPUT") ?: "Hi";
$maxOutputTokensRaw = getenv("PHASEO_SMOKE_MAX_OUTPUT_TOKENS");
$maxOutputTokens = is_string($maxOutputTokensRaw) && ctype_digit($maxOutputTokensRaw)
    ? (int) $maxOutputTokensRaw
    : 32;
if ($maxOutputTokens <= 0) {
    $maxOutputTokens = 32;
}

$response = \Phaseo\Gen\createResponse($client, null, null, null, [
    "model" => $model,
    "input" => $input,
    "max_output_tokens" => $maxOutputTokens,
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
