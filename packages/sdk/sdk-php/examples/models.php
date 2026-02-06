<?php

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../src/index.php';

use AIStats\Sdk\Client;

$apiKey = getenv('AI_STATS_API_KEY');
if (!$apiKey) {
    throw new RuntimeException('Set AI_STATS_API_KEY');
}

$client = new Client($apiKey);
$resp = $client->getModels(['limit' => 5]);
echo "models: " . count($resp->getModels()) . PHP_EOL;
