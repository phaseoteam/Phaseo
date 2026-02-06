<?php

declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

$manifestPath = realpath(__DIR__ . '/../../smoke-manifest.json');
$manifest = json_decode((string) file_get_contents($manifestPath), true);

$apiKeyEnv = $manifest['apiKeyEnv'] ?? 'AI_STATS_API_KEY';
$baseUrlEnv = $manifest['baseUrlEnv'] ?? 'AI_STATS_BASE_URL';
$apiKey = getenv($apiKeyEnv);

if (!$apiKey) {
    fwrite(STDERR, "Set {$apiKeyEnv}\n");
    exit(1);
}

$baseUrl = rtrim(getenv($baseUrlEnv) ?: $manifest['defaultBaseUrl'], '/');

$config = AIStats\Sdk\Configuration::getDefaultConfiguration()
    ->setHost($baseUrl)
    ->setApiKey('GatewayAuth', 'Bearer ' . $apiKey);
$api = new AIStats\Sdk\Api\DefaultApi(null, $config);

$health = $api->health();
if (!$health->getStatus()) {
    throw new RuntimeException('health status missing');
}

$models = $api->listModels();
if (count($models->getModels()) === 0) {
    throw new RuntimeException('models list empty');
}

$chatBody = $manifest['operations']['chat']['body'];
$chat = $api->createChatCompletion($chatBody);
if (count($chat->getChoices()) === 0) {
    throw new RuntimeException('chat choices empty');
}

$client = new GuzzleHttp\Client(['http_errors' => false]);

$unauth = $manifest['operations']['unauthorized'];
$unauthRes = $client->request($unauth['method'], $baseUrl . $unauth['path']);
if (!in_array($unauthRes->getStatusCode(), [$unauth['expectStatus'], 403], true)) {
    throw new RuntimeException('unauthorized status ' . $unauthRes->getStatusCode());
}

$notFound = $manifest['operations']['notFound'];
$nfRes = $client->request($notFound['method'], $baseUrl . $notFound['path'], [
    'headers' => ['Authorization' => 'Bearer ' . $apiKey],
]);
if ($nfRes->getStatusCode() !== $notFound['expectStatus']) {
    throw new RuntimeException('not-found status ' . $nfRes->getStatusCode());
}

echo "php smoke ok\n";
