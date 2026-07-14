# Phaseo PHP SDK

Official PHP SDK for Phaseo Gateway.

Packagist package name: `phaseo/sdk`

## Installation

```bash
composer require phaseo/sdk
```

## Quick start

```php
<?php

declare(strict_types=1);

require_once __DIR__ . '/vendor/autoload.php';

use Phaseo\Sdk\Phaseo;

$client = new Phaseo(
    apiKey: getenv('PHASEO_API_KEY') ?: null,
    basePath: getenv('PHASEO_BASE_URL') ?: 'https://api.phaseo.app/v1',
);

$response = $client->createResponse([
    'model' => 'google/gemma-3-27b:free',
    'input' => 'Reply with: PHP SDK works',
]);

echo json_encode($response, JSON_PRETTY_PRINT) . PHP_EOL;
```

## Common methods

- `createResponse(array $payload)`
- `createChatCompletion(array $payload)`
- `listModels(array $params = [])`
- `listOrganisations(array $params = [])` for paginated `/organisations` discovery
- `listPricingModels(array $params = [])` for `/pricing/models` catalogue pricing discovery
- `calculatePricing(array $payload)` for `/pricing/calculate` usage estimation
- `listProviders(array $params = [])`, `getCredits(array $params = [])`, `getActivity(array $params = [])`, and `getAnalytics(array $params = [])` for provider discovery and management-key usage surfaces
- `listApiKeys(array $params = [])` for management-key `/keys` discovery
- `createApiKey(array $payload)`, `updateApiKey(string $id, array $payload)`, and `deleteApiKey(string $id)` for management-key API-key lifecycle changes
- `getApiKey(string $id)` for management-key `/keys/{id}` lookup
- `listWorkspaces(array $params = [])`, `getWorkspace(string $id)`, `createWorkspace(array $body)`, `updateWorkspace(string $id, array $body)`, and `deleteWorkspace(string $id)` for management-key workspace lifecycle management
- `getCurrentApiKey()`
- `health()`
- `getModelDeprecationInfo(string $modelId)`
- `validateModel(string $modelId)`

Model discovery supports the public `/models` filters, including `provider`, `provider_status`, `provider_routing_status`, `model_routing_status`, `capability_status`, `provider_availability_status`, `provider_availability_reason`, `status`, `organisation`, `endpoints`, `input_types`, `output_types`, `params`, `availability`, `limit`, and `offset`.

Use `provider_availability_reason` with `availability=all` when you want rollout-state entries such as `preview_only`, `provider_not_ready`, `gated`, `access_limited`, `region_limited`, `project_limited`, `paused`, or `soft_blocked`. Use `capability_status` with `availability=all` when you want non-routable endpoint mappings such as `coming_soon` or `internal_testing`.

```php
$models = $client->listModels([
    'provider' => 'anthropic',
    'provider_status' => 'beta,not_ready',
    'provider_availability_reason' => 'preview_only,provider_not_ready',
    'capability_status' => 'coming_soon,internal_testing',
    'availability' => 'all',
]);
```

## Async job websocket helpers

Batch and video operations can expose a websocket lifecycle stream at `/v1/async/{kind}/{id}/ws`.

```php
$batchSocketUrl = $client->getBatchWebSocketUrl('batch_123', 1500);
$videoSocketUrl = $client->getVideoWebSocketUrl('video_123', null, true);
$genericSocketUrl = $client->getAsyncJobWebSocketUrl('video', 'video_123');
$resourceSocketUrl = $client->asyncJobs()->websocketUrl('video', 'video_123');

echo $batchSocketUrl . PHP_EOL;
echo $videoSocketUrl . PHP_EOL;
echo $genericSocketUrl . PHP_EOL;
echo $resourceSocketUrl . PHP_EOL;
```

## TLS and SSL behavior

TLS verification is enabled by default.

Resolution order for CA bundle:

1. Constructor `caBundlePath`
2. `PHASEO_CA_BUNDLE`
3. `curl.cainfo` / `openssl.cafile`
4. `SSL_CERT_FILE`
5. Bundled `certs/cacert.pem`

Disabling TLS verification (`verifyTls: false`) should only be used for local debugging.

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Environment variables

- `PHASEO_API_KEY` (required unless passed in code)
- `PHASEO_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)
- `PHASEO_CA_BUNDLE` (optional TLS override)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:php`
- Validate and test: `pnpm --filter @phaseo/php-sdk run validate && pnpm --filter @phaseo/php-sdk run test`
