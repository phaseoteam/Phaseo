# AI Stats PHP SDK (preview)

Generated from the AI Stats Gateway OpenAPI spec. The current wrapper (`src/index.php`) exposes only the `models` endpoint to lay groundwork.

Status:
- **Preview**: Not published yet. Will be released to Packagist once the client surface stabilises.
- Generate with `pnpm openapi:gen:php`.

Usage (after generation):
```php
$client = new \AIStats\Sdk\Client('<API_KEY>');
$resp = $client->getModels(['limit' => 5]);
```

Python and TypeScript SDKs are fully supported today; other languages will follow soon.
