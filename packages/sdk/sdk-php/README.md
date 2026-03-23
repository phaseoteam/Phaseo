# AI Stats PHP SDK

Generated from the AI Stats Gateway OpenAPI spec.

Packagist package name: `ai-stats/php-sdk`

Generate with `pnpm openapi:gen:php`.

Usage:
```php
// Uses AI_STATS_API_KEY from environment by default.
$client = new \AIStats\Sdk\AIStats();
$resp = $client->listModels(['limit' => 5]);
```

## TLS / SSL Reliability

The SDK verifies TLS by default. To keep this reliable across environments:

- It first uses an explicit constructor `caBundlePath` (if provided).
- Then it checks `AI_STATS_CA_BUNDLE`.
- Then PHP INI values (`curl.cainfo`, `openssl.cafile`).
- Then `SSL_CERT_FILE`.
- Finally it falls back to the bundled `certs/cacert.pem` shipped with this SDK.

You can override CA path explicitly:

```php
$client = new \AIStats\Sdk\AIStats(
    apiKey: getenv("AI_STATS_API_KEY"),
    caBundlePath: "/path/to/cacert.pem"
);
```

Disabling TLS verification (`verifyTls: false`) is supported for local debugging only and should not be used in production.
