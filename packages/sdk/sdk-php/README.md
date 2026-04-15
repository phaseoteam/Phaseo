# AI Stats PHP SDK

Official PHP SDK for AI Stats Gateway.

Packagist package name: `ai-stats/php-sdk`

## Installation

```bash
composer require ai-stats/php-sdk
```

## Quick start

```php
<?php

declare(strict_types=1);

require_once __DIR__ . '/vendor/autoload.php';

use AIStats\Sdk\AIStats;

$client = new AIStats(
    apiKey: getenv('AI_STATS_API_KEY') ?: null,
    basePath: getenv('AI_STATS_BASE_URL') ?: 'https://api.phaseo.app/v1',
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
- `getModelDeprecationInfo(string $modelId)`
- `validateModel(string $modelId)`

## TLS and SSL behavior

TLS verification is enabled by default.

Resolution order for CA bundle:

1. Constructor `caBundlePath`
2. `AI_STATS_CA_BUNDLE`
3. `curl.cainfo` / `openssl.cafile`
4. `SSL_CERT_FILE`
5. Bundled `certs/cacert.pem`

Disabling TLS verification (`verifyTls: false`) should only be used for local debugging.

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Environment variables

- `AI_STATS_API_KEY` (required unless passed in code)
- `AI_STATS_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)
- `AI_STATS_CA_BUNDLE` (optional TLS override)

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:php`
- Validate and test: `pnpm --filter @ai-stats/php-sdk run validate && pnpm --filter @ai-stats/php-sdk run test`
