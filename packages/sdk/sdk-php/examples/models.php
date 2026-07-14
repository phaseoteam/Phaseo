<?php

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../src/index.php';

use Phaseo\Sdk\Phaseo;

$apiKey = getenv('PHASEO_API_KEY');
if (!$apiKey) {
    throw new RuntimeException('Set PHASEO_API_KEY');
}

$client = new Phaseo($apiKey);
$resp = $client->listModels([
    'provider' => 'anthropic',
    'provider_status' => 'beta,not_ready',
    'provider_availability_reason' => 'preview_only,provider_not_ready',
    'capability_status' => 'coming_soon,internal_testing',
    'availability' => 'all',
    'limit' => 5,
]);
$models = is_array($resp) && isset($resp['models']) && is_array($resp['models']) ? $resp['models'] : [];
echo "models: " . count($models) . PHP_EOL;
