<?php

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../src/index.php';

use AIStats\Sdk\AIStats;

$apiKey = getenv('AI_STATS_API_KEY');
if (!$apiKey) {
    throw new RuntimeException('Set AI_STATS_API_KEY');
}

$client = new AIStats($apiKey);
$resp = $client->listModels(['limit' => 5]);
$models = is_array($resp) && isset($resp['models']) && is_array($resp['models']) ? $resp['models'] : [];
echo "models: " . count($models) . PHP_EOL;
