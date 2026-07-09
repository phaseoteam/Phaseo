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

$response = \Phaseo\Gen\createChatCompletion($client, null, null, null, [
    "model" => $model,
    "messages" => [
        ["role" => "user", "content" => $input]
    ]
]);

echo json_encode($response, JSON_PRETTY_PRINT) . PHP_EOL;
