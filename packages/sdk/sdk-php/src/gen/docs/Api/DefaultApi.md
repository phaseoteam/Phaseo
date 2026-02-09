# AIStats\Sdk\DefaultApi



All URIs are relative to https://api.phaseo.app/v1, except if the operation defines another base path.

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**calculatePricing()**](DefaultApi.md#calculatePricing) | **POST** /pricing/calculate | Calculate pricing |
| [**createAnthropicMessage()**](DefaultApi.md#createAnthropicMessage) | **POST** /messages | Create message |
| [**createBatch()**](DefaultApi.md#createBatch) | **POST** /batches | Create batch |
| [**createBatchAlias()**](DefaultApi.md#createBatchAlias) | **POST** /batch | Create batch (alias) |
| [**createChatCompletion()**](DefaultApi.md#createChatCompletion) | **POST** /chat/completions | Create chat completion |
| [**createEmbedding()**](DefaultApi.md#createEmbedding) | **POST** /embeddings | Create embeddings |
| [**createImage()**](DefaultApi.md#createImage) | **POST** /images/generations | Create image |
| [**createImageEdit()**](DefaultApi.md#createImageEdit) | **POST** /images/edits | Create image edit |
| [**createKeyPlaceholder()**](DefaultApi.md#createKeyPlaceholder) | **POST** /keys | Create key (placeholder) |
| [**createModeration()**](DefaultApi.md#createModeration) | **POST** /moderations | Create moderation |
| [**createOAuthClient()**](DefaultApi.md#createOAuthClient) | **POST** /oauth-clients | Create OAuth client |
| [**createOcr()**](DefaultApi.md#createOcr) | **POST** /ocr | Create OCR |
| [**createResponse()**](DefaultApi.md#createResponse) | **POST** /responses | Create response |
| [**createSpeech()**](DefaultApi.md#createSpeech) | **POST** /audio/speech | Generate speech |
| [**createTranscription()**](DefaultApi.md#createTranscription) | **POST** /audio/transcriptions | Create transcription |
| [**createTranslation()**](DefaultApi.md#createTranslation) | **POST** /audio/translations | Create translation |
| [**createVideo()**](DefaultApi.md#createVideo) | **POST** /videos | Create video |
| [**createVideoAlias()**](DefaultApi.md#createVideoAlias) | **POST** /video/generations | Create video (alias) |
| [**deleteOAuthClient()**](DefaultApi.md#deleteOAuthClient) | **DELETE** /oauth-clients/{client_id} | Delete OAuth client |
| [**deleteProvisioningKey()**](DefaultApi.md#deleteProvisioningKey) | **DELETE** /management/keys/{id} | Delete management API key |
| [**deleteProvisioningKeyAlias()**](DefaultApi.md#deleteProvisioningKeyAlias) | **DELETE** /provisioning/keys/{id} | Delete provisioning key |
| [**deleteVideo()**](DefaultApi.md#deleteVideo) | **DELETE** /videos/{video_id} | Delete video |
| [**deleteVideoAlias()**](DefaultApi.md#deleteVideoAlias) | **DELETE** /video/generations/{video_id} | Delete video (alias) |
| [**generateMusic()**](DefaultApi.md#generateMusic) | **POST** /music/generate | Generate music |
| [**generateMusicAlias()**](DefaultApi.md#generateMusicAlias) | **POST** /music/generations | Generate music (alias) |
| [**getActivity()**](DefaultApi.md#getActivity) | **GET** /activity | Get activity |
| [**getAnalytics()**](DefaultApi.md#getAnalytics) | **POST** /analytics | Get analytics |
| [**getCredits()**](DefaultApi.md#getCredits) | **GET** /credits | Get remaining credits |
| [**getGeneration()**](DefaultApi.md#getGeneration) | **GET** /generations | Get generation |
| [**getKeyPlaceholder()**](DefaultApi.md#getKeyPlaceholder) | **GET** /key | Get key (placeholder) |
| [**getMusicGeneration()**](DefaultApi.md#getMusicGeneration) | **GET** /music/generate/{music_id} | Get music generation status |
| [**getMusicGenerationAlias()**](DefaultApi.md#getMusicGenerationAlias) | **GET** /music/generations/{music_id} | Get music generation status (alias) |
| [**getOAuthClient()**](DefaultApi.md#getOAuthClient) | **GET** /oauth-clients/{client_id} | Get OAuth client |
| [**getProviderDerankStatus()**](DefaultApi.md#getProviderDerankStatus) | **GET** /health/providers/{provider_id}/derank | Provider derank status |
| [**getProvisioningKey()**](DefaultApi.md#getProvisioningKey) | **GET** /management/keys/{id} | Get management API key |
| [**getProvisioningKeyAlias()**](DefaultApi.md#getProvisioningKeyAlias) | **GET** /provisioning/keys/{id} | Get provisioning key |
| [**getVideo()**](DefaultApi.md#getVideo) | **GET** /videos/{video_id} | Get video status |
| [**getVideoAlias()**](DefaultApi.md#getVideoAlias) | **GET** /video/generations/{video_id} | Get video status (alias) |
| [**getVideoContent()**](DefaultApi.md#getVideoContent) | **GET** /videos/{video_id}/content | Get video content |
| [**getVideoContentAlias()**](DefaultApi.md#getVideoContentAlias) | **GET** /video/generations/{video_id}/content | Get video content (alias) |
| [**healthz()**](DefaultApi.md#healthz) | **GET** /health | Health check |
| [**invalidateGatewayKeyCache()**](DefaultApi.md#invalidateGatewayKeyCache) | **POST** /keys/{id}/invalidate | Invalidate key cache |
| [**listEndpointsPlaceholder()**](DefaultApi.md#listEndpointsPlaceholder) | **GET** /endpoints | List endpoints (placeholder) |
| [**listFiles()**](DefaultApi.md#listFiles) | **GET** /files | List files |
| [**listKeysPlaceholder()**](DefaultApi.md#listKeysPlaceholder) | **GET** /keys | List keys (placeholder) |
| [**listModels()**](DefaultApi.md#listModels) | **GET** /models | List models |
| [**listOAuthClients()**](DefaultApi.md#listOAuthClients) | **GET** /oauth-clients | List OAuth clients |
| [**listOrganisations()**](DefaultApi.md#listOrganisations) | **GET** /organisations | List organisations |
| [**listPricingModels()**](DefaultApi.md#listPricingModels) | **GET** /pricing/models | List pricing models |
| [**listProviders()**](DefaultApi.md#listProviders) | **GET** /providers | List providers |
| [**listProvisioningKeys()**](DefaultApi.md#listProvisioningKeys) | **GET** /management/keys | List management API keys |
| [**listProvisioningKeysAlias()**](DefaultApi.md#listProvisioningKeysAlias) | **GET** /provisioning/keys | List provisioning keys |
| [**regenerateOAuthClientSecret()**](DefaultApi.md#regenerateOAuthClientSecret) | **POST** /oauth-clients/{client_id}/regenerate-secret | Regenerate OAuth client secret |
| [**retrieveBatch()**](DefaultApi.md#retrieveBatch) | **GET** /batches/{batch_id} | Retrieve batch |
| [**retrieveBatchAlias()**](DefaultApi.md#retrieveBatchAlias) | **GET** /batch/{id} | Retrieve batch (alias) |
| [**retrieveFile()**](DefaultApi.md#retrieveFile) | **GET** /files/{file_id} | Retrieve file |
| [**root()**](DefaultApi.md#root) | **GET** / | Root endpoint |
| [**updateOAuthClient()**](DefaultApi.md#updateOAuthClient) | **PATCH** /oauth-clients/{client_id} | Update OAuth client |
| [**updateProvisioningKey()**](DefaultApi.md#updateProvisioningKey) | **PATCH** /management/keys/{id} | Update management API key |
| [**updateProvisioningKeyAlias()**](DefaultApi.md#updateProvisioningKeyAlias) | **PATCH** /provisioning/keys/{id} | Update provisioning key |
| [**uploadFile()**](DefaultApi.md#uploadFile) | **POST** /files | Upload file |


## `calculatePricing()`

```php
calculatePricing($calculate_pricing_request): \AIStats\Sdk\Model\CalculatePricing200Response
```

Calculate pricing

Calculates price for a usage payload.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$calculate_pricing_request = new \AIStats\Sdk\Model\CalculatePricingRequest(); // \AIStats\Sdk\Model\CalculatePricingRequest

try {
    $result = $apiInstance->calculatePricing($calculate_pricing_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->calculatePricing: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **calculate_pricing_request** | [**\AIStats\Sdk\Model\CalculatePricingRequest**](../Model/CalculatePricingRequest.md)|  | |

### Return type

[**\AIStats\Sdk\Model\CalculatePricing200Response**](../Model/CalculatePricing200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createAnthropicMessage()`

```php
createAnthropicMessage($anthropic_messages_request): \AIStats\Sdk\Model\AnthropicMessagesResponse
```

Create message

Creates a message using the Anthropic Messages API.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$anthropic_messages_request = new \AIStats\Sdk\Model\AnthropicMessagesRequest(); // \AIStats\Sdk\Model\AnthropicMessagesRequest

try {
    $result = $apiInstance->createAnthropicMessage($anthropic_messages_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createAnthropicMessage: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **anthropic_messages_request** | [**\AIStats\Sdk\Model\AnthropicMessagesRequest**](../Model/AnthropicMessagesRequest.md)|  | |

### Return type

[**\AIStats\Sdk\Model\AnthropicMessagesResponse**](../Model/AnthropicMessagesResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`, `text/event-stream`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createBatch()`

```php
createBatch($batch_request): \AIStats\Sdk\Model\BatchResponse
```

Create batch

Creates a batch of API requests.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$batch_request = new \AIStats\Sdk\Model\BatchRequest(); // \AIStats\Sdk\Model\BatchRequest

try {
    $result = $apiInstance->createBatch($batch_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createBatch: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **batch_request** | [**\AIStats\Sdk\Model\BatchRequest**](../Model/BatchRequest.md)|  | |

### Return type

[**\AIStats\Sdk\Model\BatchResponse**](../Model/BatchResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createBatchAlias()`

```php
createBatchAlias($batch_request): \AIStats\Sdk\Model\BatchResponse
```

Create batch (alias)

Alias of /batches.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$batch_request = new \AIStats\Sdk\Model\BatchRequest(); // \AIStats\Sdk\Model\BatchRequest

try {
    $result = $apiInstance->createBatchAlias($batch_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createBatchAlias: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **batch_request** | [**\AIStats\Sdk\Model\BatchRequest**](../Model/BatchRequest.md)|  | |

### Return type

[**\AIStats\Sdk\Model\BatchResponse**](../Model/BatchResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createChatCompletion()`

```php
createChatCompletion($chat_completions_request): \AIStats\Sdk\Model\ChatCompletionsResponse
```

Create chat completion

Creates a completion for the chat message.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$chat_completions_request = new \AIStats\Sdk\Model\ChatCompletionsRequest(); // \AIStats\Sdk\Model\ChatCompletionsRequest

try {
    $result = $apiInstance->createChatCompletion($chat_completions_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createChatCompletion: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **chat_completions_request** | [**\AIStats\Sdk\Model\ChatCompletionsRequest**](../Model/ChatCompletionsRequest.md)|  | |

### Return type

[**\AIStats\Sdk\Model\ChatCompletionsResponse**](../Model/ChatCompletionsResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createEmbedding()`

```php
createEmbedding($embeddings_request): \AIStats\Sdk\Model\EmbeddingsResponse
```

Create embeddings

Creates an embedding vector representing the input text.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$embeddings_request = new \AIStats\Sdk\Model\EmbeddingsRequest(); // \AIStats\Sdk\Model\EmbeddingsRequest

try {
    $result = $apiInstance->createEmbedding($embeddings_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createEmbedding: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **embeddings_request** | [**\AIStats\Sdk\Model\EmbeddingsRequest**](../Model/EmbeddingsRequest.md)|  | |

### Return type

[**\AIStats\Sdk\Model\EmbeddingsResponse**](../Model/EmbeddingsResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createImage()`

```php
createImage($images_generation_request): \AIStats\Sdk\Model\ImagesGenerationResponse
```

Create image

Creates an image given a prompt.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$images_generation_request = new \AIStats\Sdk\Model\ImagesGenerationRequest(); // \AIStats\Sdk\Model\ImagesGenerationRequest

try {
    $result = $apiInstance->createImage($images_generation_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createImage: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **images_generation_request** | [**\AIStats\Sdk\Model\ImagesGenerationRequest**](../Model/ImagesGenerationRequest.md)|  | |

### Return type

[**\AIStats\Sdk\Model\ImagesGenerationResponse**](../Model/ImagesGenerationResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createImageEdit()`

```php
createImageEdit($model, $image, $prompt, $mask, $size, $n, $user, $meta, $usage, $provider): \AIStats\Sdk\Model\ImagesEditResponse
```

Create image edit

Creates an edited or extended image given an original image and a prompt.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$model = 'model_example'; // string
$image = 'image_example'; // string
$prompt = 'prompt_example'; // string
$mask = 'mask_example'; // string
$size = 'size_example'; // string
$n = 56; // int
$user = 'user_example'; // string
$meta = True; // bool
$usage = True; // bool
$provider = new \AIStats\Sdk\Model\ProviderRoutingOptions(); // \AIStats\Sdk\Model\ProviderRoutingOptions

try {
    $result = $apiInstance->createImageEdit($model, $image, $prompt, $mask, $size, $n, $user, $meta, $usage, $provider);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createImageEdit: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **model** | **string**|  | |
| **image** | **string**|  | |
| **prompt** | **string**|  | |
| **mask** | **string**|  | [optional] |
| **size** | **string**|  | [optional] |
| **n** | **int**|  | [optional] |
| **user** | **string**|  | [optional] |
| **meta** | **bool**|  | [optional] |
| **usage** | **bool**|  | [optional] |
| **provider** | [**\AIStats\Sdk\Model\ProviderRoutingOptions**](../Model/ProviderRoutingOptions.md)|  | [optional] |

### Return type

[**\AIStats\Sdk\Model\ImagesEditResponse**](../Model/ImagesEditResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `multipart/form-data`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createKeyPlaceholder()`

```php
createKeyPlaceholder()
```

Create key (placeholder)

Placeholder route; currently returns not implemented.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);

try {
    $apiInstance->createKeyPlaceholder();
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createKeyPlaceholder: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

This endpoint does not need any parameter.

### Return type

void (empty response body)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createModeration()`

```php
createModeration($moderations_request): \AIStats\Sdk\Model\ModerationsResponse
```

Create moderation

Classifies if text violates OpenAI's usage policies.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$moderations_request = new \AIStats\Sdk\Model\ModerationsRequest(); // \AIStats\Sdk\Model\ModerationsRequest

try {
    $result = $apiInstance->createModeration($moderations_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createModeration: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **moderations_request** | [**\AIStats\Sdk\Model\ModerationsRequest**](../Model/ModerationsRequest.md)|  | |

### Return type

[**\AIStats\Sdk\Model\ModerationsResponse**](../Model/ModerationsResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createOAuthClient()`

```php
createOAuthClient($create_o_auth_client_request): array<string,mixed>
```

Create OAuth client

Creates a team-scoped OAuth client.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$create_o_auth_client_request = new \AIStats\Sdk\Model\CreateOAuthClientRequest(); // \AIStats\Sdk\Model\CreateOAuthClientRequest

try {
    $result = $apiInstance->createOAuthClient($create_o_auth_client_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createOAuthClient: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **create_o_auth_client_request** | [**\AIStats\Sdk\Model\CreateOAuthClientRequest**](../Model/CreateOAuthClientRequest.md)|  | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createOcr()`

```php
createOcr($ocr_request): array<string,mixed>
```

Create OCR

Extracts text from an image using the requested model.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$ocr_request = new \AIStats\Sdk\Model\OcrRequest(); // \AIStats\Sdk\Model\OcrRequest

try {
    $result = $apiInstance->createOcr($ocr_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createOcr: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **ocr_request** | [**\AIStats\Sdk\Model\OcrRequest**](../Model/OcrRequest.md)|  | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createResponse()`

```php
createResponse($responses_request): \AIStats\Sdk\Model\ResponsesResponse
```

Create response

Creates a response using the Responses API.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$responses_request = new \AIStats\Sdk\Model\ResponsesRequest(); // \AIStats\Sdk\Model\ResponsesRequest

try {
    $result = $apiInstance->createResponse($responses_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createResponse: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **responses_request** | [**\AIStats\Sdk\Model\ResponsesRequest**](../Model/ResponsesRequest.md)|  | |

### Return type

[**\AIStats\Sdk\Model\ResponsesResponse**](../Model/ResponsesResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createSpeech()`

```php
createSpeech($audio_speech_request): \SplFileObject
```

Generate speech

Generates audio from the input text.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$audio_speech_request = new \AIStats\Sdk\Model\AudioSpeechRequest(); // \AIStats\Sdk\Model\AudioSpeechRequest

try {
    $result = $apiInstance->createSpeech($audio_speech_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createSpeech: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **audio_speech_request** | [**\AIStats\Sdk\Model\AudioSpeechRequest**](../Model/AudioSpeechRequest.md)|  | |

### Return type

**\SplFileObject**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `audio/mpeg`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createTranscription()`

```php
createTranscription($model, $audio_url, $audio_b64, $language, $provider): \AIStats\Sdk\Model\AudioTranscriptionResponse
```

Create transcription

Transcribes audio into the input language.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$model = 'model_example'; // string
$audio_url = 'audio_url_example'; // string
$audio_b64 = 'audio_b64_example'; // string
$language = 'language_example'; // string
$provider = new \AIStats\Sdk\Model\ProviderRoutingOptions(); // \AIStats\Sdk\Model\ProviderRoutingOptions

try {
    $result = $apiInstance->createTranscription($model, $audio_url, $audio_b64, $language, $provider);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createTranscription: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **model** | **string**|  | |
| **audio_url** | **string**|  | [optional] |
| **audio_b64** | **string**|  | [optional] |
| **language** | **string**|  | [optional] |
| **provider** | [**\AIStats\Sdk\Model\ProviderRoutingOptions**](../Model/ProviderRoutingOptions.md)|  | [optional] |

### Return type

[**\AIStats\Sdk\Model\AudioTranscriptionResponse**](../Model/AudioTranscriptionResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `multipart/form-data`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createTranslation()`

```php
createTranslation($model, $audio_url, $audio_b64, $language, $prompt, $temperature, $provider): \AIStats\Sdk\Model\AudioTranslationResponse
```

Create translation

Translates audio into English.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$model = 'model_example'; // string
$audio_url = 'audio_url_example'; // string
$audio_b64 = 'audio_b64_example'; // string
$language = 'language_example'; // string
$prompt = 'prompt_example'; // string
$temperature = 3.4; // float
$provider = new \AIStats\Sdk\Model\ProviderRoutingOptions(); // \AIStats\Sdk\Model\ProviderRoutingOptions

try {
    $result = $apiInstance->createTranslation($model, $audio_url, $audio_b64, $language, $prompt, $temperature, $provider);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createTranslation: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **model** | **string**|  | |
| **audio_url** | **string**|  | [optional] |
| **audio_b64** | **string**|  | [optional] |
| **language** | **string**|  | [optional] |
| **prompt** | **string**|  | [optional] |
| **temperature** | **float**|  | [optional] |
| **provider** | [**\AIStats\Sdk\Model\ProviderRoutingOptions**](../Model/ProviderRoutingOptions.md)|  | [optional] |

### Return type

[**\AIStats\Sdk\Model\AudioTranslationResponse**](../Model/AudioTranslationResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `multipart/form-data`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createVideo()`

```php
createVideo($video_generation_request): \AIStats\Sdk\Model\VideoGenerationResponse
```

Create video

Creates a video from a prompt.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$video_generation_request = new \AIStats\Sdk\Model\VideoGenerationRequest(); // \AIStats\Sdk\Model\VideoGenerationRequest

try {
    $result = $apiInstance->createVideo($video_generation_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createVideo: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **video_generation_request** | [**\AIStats\Sdk\Model\VideoGenerationRequest**](../Model/VideoGenerationRequest.md)|  | |

### Return type

[**\AIStats\Sdk\Model\VideoGenerationResponse**](../Model/VideoGenerationResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createVideoAlias()`

```php
createVideoAlias($video_generation_request): \AIStats\Sdk\Model\VideoGenerationResponse
```

Create video (alias)

Alias of /videos.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$video_generation_request = new \AIStats\Sdk\Model\VideoGenerationRequest(); // \AIStats\Sdk\Model\VideoGenerationRequest

try {
    $result = $apiInstance->createVideoAlias($video_generation_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createVideoAlias: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **video_generation_request** | [**\AIStats\Sdk\Model\VideoGenerationRequest**](../Model/VideoGenerationRequest.md)|  | |

### Return type

[**\AIStats\Sdk\Model\VideoGenerationResponse**](../Model/VideoGenerationResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `deleteOAuthClient()`

```php
deleteOAuthClient($client_id): array<string,mixed>
```

Delete OAuth client

Deletes an OAuth client and related metadata.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$client_id = 'client_id_example'; // string

try {
    $result = $apiInstance->deleteOAuthClient($client_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->deleteOAuthClient: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **client_id** | **string**|  | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `deleteProvisioningKey()`

```php
deleteProvisioningKey($id): \AIStats\Sdk\Model\DeleteProvisioningKey200Response
```

Delete management API key

Permanently deletes a management API key.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$id = 'id_example'; // string | The management API key ID

try {
    $result = $apiInstance->deleteProvisioningKey($id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->deleteProvisioningKey: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **string**| The management API key ID | |

### Return type

[**\AIStats\Sdk\Model\DeleteProvisioningKey200Response**](../Model/DeleteProvisioningKey200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `deleteProvisioningKeyAlias()`

```php
deleteProvisioningKeyAlias($id): array<string,mixed>
```

Delete provisioning key

Alias of management key delete endpoint.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$id = 'id_example'; // string

try {
    $result = $apiInstance->deleteProvisioningKeyAlias($id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->deleteProvisioningKeyAlias: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **string**|  | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `deleteVideo()`

```php
deleteVideo($video_id): \AIStats\Sdk\Model\VideoDeleteResponse
```

Delete video

Deletes a video generation request.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$video_id = 'video_id_example'; // string | The ID of the video generation request.

try {
    $result = $apiInstance->deleteVideo($video_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->deleteVideo: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **video_id** | **string**| The ID of the video generation request. | |

### Return type

[**\AIStats\Sdk\Model\VideoDeleteResponse**](../Model/VideoDeleteResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `deleteVideoAlias()`

```php
deleteVideoAlias($video_id): \AIStats\Sdk\Model\VideoDeleteResponse
```

Delete video (alias)

Alias of /videos/{video_id}.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$video_id = 'video_id_example'; // string

try {
    $result = $apiInstance->deleteVideoAlias($video_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->deleteVideoAlias: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **video_id** | **string**|  | |

### Return type

[**\AIStats\Sdk\Model\VideoDeleteResponse**](../Model/VideoDeleteResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `generateMusic()`

```php
generateMusic($music_generate_request): array<string,mixed>
```

Generate music

Generates music using the requested model and provider settings.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$music_generate_request = new \AIStats\Sdk\Model\MusicGenerateRequest(); // \AIStats\Sdk\Model\MusicGenerateRequest

try {
    $result = $apiInstance->generateMusic($music_generate_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->generateMusic: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **music_generate_request** | [**\AIStats\Sdk\Model\MusicGenerateRequest**](../Model/MusicGenerateRequest.md)|  | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `generateMusicAlias()`

```php
generateMusicAlias($music_generate_request): array<string,mixed>
```

Generate music (alias)

Alias of /music/generate.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$music_generate_request = new \AIStats\Sdk\Model\MusicGenerateRequest(); // \AIStats\Sdk\Model\MusicGenerateRequest

try {
    $result = $apiInstance->generateMusicAlias($music_generate_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->generateMusicAlias: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **music_generate_request** | [**\AIStats\Sdk\Model\MusicGenerateRequest**](../Model/MusicGenerateRequest.md)|  | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getActivity()`

```php
getActivity($team_id, $days, $limit, $offset): \AIStats\Sdk\Model\GetActivity200Response
```

Get activity

Returns recent API activity for a team.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$team_id = 'team_id_example'; // string | The team ID to query
$days = 30; // int | Number of days to look back
$limit = 50; // int | Maximum number of records to return
$offset = 0; // int | Pagination offset

try {
    $result = $apiInstance->getActivity($team_id, $days, $limit, $offset);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getActivity: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **team_id** | **string**| The team ID to query | |
| **days** | **int**| Number of days to look back | [optional] [default to 30] |
| **limit** | **int**| Maximum number of records to return | [optional] [default to 50] |
| **offset** | **int**| Pagination offset | [optional] [default to 0] |

### Return type

[**\AIStats\Sdk\Model\GetActivity200Response**](../Model/GetActivity200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getAnalytics()`

```php
getAnalytics($get_analytics_request): \AIStats\Sdk\Model\GetAnalytics200Response
```

Get analytics

Returns aggregated analytics data.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$get_analytics_request = new \AIStats\Sdk\Model\GetAnalyticsRequest(); // \AIStats\Sdk\Model\GetAnalyticsRequest

try {
    $result = $apiInstance->getAnalytics($get_analytics_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getAnalytics: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **get_analytics_request** | [**\AIStats\Sdk\Model\GetAnalyticsRequest**](../Model/GetAnalyticsRequest.md)|  | |

### Return type

[**\AIStats\Sdk\Model\GetAnalytics200Response**](../Model/GetAnalytics200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getCredits()`

```php
getCredits($team_id): \AIStats\Sdk\Model\GetCredits200Response
```

Get remaining credits

Returns the remaining credits and usage statistics for a team.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$team_id = 'team_id_example'; // string | The team ID to query

try {
    $result = $apiInstance->getCredits($team_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getCredits: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **team_id** | **string**| The team ID to query | |

### Return type

[**\AIStats\Sdk\Model\GetCredits200Response**](../Model/GetCredits200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getGeneration()`

```php
getGeneration($id): \AIStats\Sdk\Model\GenerationResponse
```

Get generation

Retrieve a specific generation by ID.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$id = 'id_example'; // string | The ID of the generation

try {
    $result = $apiInstance->getGeneration($id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getGeneration: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **string**| The ID of the generation | |

### Return type

[**\AIStats\Sdk\Model\GenerationResponse**](../Model/GenerationResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getKeyPlaceholder()`

```php
getKeyPlaceholder()
```

Get key (placeholder)

Placeholder route; currently returns not implemented.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);

try {
    $apiInstance->getKeyPlaceholder();
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getKeyPlaceholder: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

This endpoint does not need any parameter.

### Return type

void (empty response body)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getMusicGeneration()`

```php
getMusicGeneration($music_id): array<string,mixed>
```

Get music generation status

Retrieves the status for a music generation request.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$music_id = 'music_id_example'; // string | The ID of the music generation request.

try {
    $result = $apiInstance->getMusicGeneration($music_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getMusicGeneration: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **music_id** | **string**| The ID of the music generation request. | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getMusicGenerationAlias()`

```php
getMusicGenerationAlias($music_id): array<string,mixed>
```

Get music generation status (alias)

Alias of /music/generate/{music_id}.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$music_id = 'music_id_example'; // string

try {
    $result = $apiInstance->getMusicGenerationAlias($music_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getMusicGenerationAlias: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **music_id** | **string**|  | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getOAuthClient()`

```php
getOAuthClient($client_id): array<string,mixed>
```

Get OAuth client

Returns details for an OAuth client.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$client_id = 'client_id_example'; // string

try {
    $result = $apiInstance->getOAuthClient($client_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getOAuthClient: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **client_id** | **string**|  | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getProviderDerankStatus()`

```php
getProviderDerankStatus($provider_id, $window_hours, $max_pairs, $fetch_limit): array<string,mixed>
```

Provider derank status

Returns breaker-based derank/recovery status for a provider.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$provider_id = 'provider_id_example'; // string | Provider identifier.
$window_hours = 56; // int | Observation window in hours.
$max_pairs = 56; // int | Max endpoint/model tuples to inspect.
$fetch_limit = 56; // int | Max recent requests to scan.

try {
    $result = $apiInstance->getProviderDerankStatus($provider_id, $window_hours, $max_pairs, $fetch_limit);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getProviderDerankStatus: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **provider_id** | **string**| Provider identifier. | |
| **window_hours** | **int**| Observation window in hours. | [optional] |
| **max_pairs** | **int**| Max endpoint/model tuples to inspect. | [optional] |
| **fetch_limit** | **int**| Max recent requests to scan. | [optional] |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getProvisioningKey()`

```php
getProvisioningKey($id): \AIStats\Sdk\Model\GetProvisioningKey200Response
```

Get management API key

Returns details of a specific management API key.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$id = 'id_example'; // string | The management API key ID

try {
    $result = $apiInstance->getProvisioningKey($id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getProvisioningKey: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **string**| The management API key ID | |

### Return type

[**\AIStats\Sdk\Model\GetProvisioningKey200Response**](../Model/GetProvisioningKey200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getProvisioningKeyAlias()`

```php
getProvisioningKeyAlias($id): array<string,mixed>
```

Get provisioning key

Alias of management key details endpoint.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$id = 'id_example'; // string

try {
    $result = $apiInstance->getProvisioningKeyAlias($id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getProvisioningKeyAlias: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **string**|  | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getVideo()`

```php
getVideo($video_id): \AIStats\Sdk\Model\VideoGenerationResponse
```

Get video status

Retrieves the status for a video generation request.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$video_id = 'video_id_example'; // string | The ID of the video generation request.

try {
    $result = $apiInstance->getVideo($video_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getVideo: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **video_id** | **string**| The ID of the video generation request. | |

### Return type

[**\AIStats\Sdk\Model\VideoGenerationResponse**](../Model/VideoGenerationResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getVideoAlias()`

```php
getVideoAlias($video_id): \AIStats\Sdk\Model\VideoGenerationResponse
```

Get video status (alias)

Alias of /videos/{video_id}.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$video_id = 'video_id_example'; // string

try {
    $result = $apiInstance->getVideoAlias($video_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getVideoAlias: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **video_id** | **string**|  | |

### Return type

[**\AIStats\Sdk\Model\VideoGenerationResponse**](../Model/VideoGenerationResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getVideoContent()`

```php
getVideoContent($video_id): \SplFileObject
```

Get video content

Downloads the rendered video content.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$video_id = 'video_id_example'; // string | The ID of the video generation request.

try {
    $result = $apiInstance->getVideoContent($video_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getVideoContent: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **video_id** | **string**| The ID of the video generation request. | |

### Return type

**\SplFileObject**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/octet-stream`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `getVideoContentAlias()`

```php
getVideoContentAlias($video_id): \SplFileObject
```

Get video content (alias)

Alias of /videos/{video_id}/content.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$video_id = 'video_id_example'; // string

try {
    $result = $apiInstance->getVideoContentAlias($video_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->getVideoContentAlias: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **video_id** | **string**|  | |

### Return type

**\SplFileObject**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/octet-stream`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `healthz()`

```php
healthz(): \AIStats\Sdk\Model\Healthz200Response
```

Health check

Returns the health status of the API.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);

try {
    $result = $apiInstance->healthz();
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->healthz: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**\AIStats\Sdk\Model\Healthz200Response**](../Model/Healthz200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `invalidateGatewayKeyCache()`

```php
invalidateGatewayKeyCache($id): array<string,mixed>
```

Invalidate key cache

Bumps cache version for key id/kid and invalidates key cache entries.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$id = 'id_example'; // string | Gateway key ID.

try {
    $result = $apiInstance->invalidateGatewayKeyCache($id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->invalidateGatewayKeyCache: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **string**| Gateway key ID. | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `listEndpointsPlaceholder()`

```php
listEndpointsPlaceholder()
```

List endpoints (placeholder)

Placeholder route; currently returns not implemented.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);

try {
    $apiInstance->listEndpointsPlaceholder();
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->listEndpointsPlaceholder: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

This endpoint does not need any parameter.

### Return type

void (empty response body)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `listFiles()`

```php
listFiles(): \AIStats\Sdk\Model\ListFilesResponse
```

List files

Returns a list of files that belong to the user's organization.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);

try {
    $result = $apiInstance->listFiles();
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->listFiles: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**\AIStats\Sdk\Model\ListFilesResponse**](../Model/ListFilesResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `listKeysPlaceholder()`

```php
listKeysPlaceholder()
```

List keys (placeholder)

Placeholder route; currently returns not implemented.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);

try {
    $apiInstance->listKeysPlaceholder();
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->listKeysPlaceholder: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

This endpoint does not need any parameter.

### Return type

void (empty response body)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `listModels()`

```php
listModels($endpoints, $organisation, $input_types, $output_types, $params, $limit, $offset): \AIStats\Sdk\Model\ListModels200Response
```

List models

Returns a list of available models.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$endpoints = array('endpoints_example'); // string[] | Filter by endpoints
$organisation = new \AIStats\Sdk\Model\\AIStats\Sdk\Model\ListModelsOrganisationParameter(); // \AIStats\Sdk\Model\ListModelsOrganisationParameter | Filter by organisation
$input_types = array('input_types_example'); // string[] | Filter by input types
$output_types = array('output_types_example'); // string[] | Filter by output types
$params = array('params_example'); // string[] | Filter by params
$limit = 50; // int | Limit the number of results
$offset = 0; // int | Offset for pagination

try {
    $result = $apiInstance->listModels($endpoints, $organisation, $input_types, $output_types, $params, $limit, $offset);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->listModels: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **endpoints** | [**string[]**](../Model/string.md)| Filter by endpoints | [optional] |
| **organisation** | [**\AIStats\Sdk\Model\ListModelsOrganisationParameter**](../Model/.md)| Filter by organisation | [optional] |
| **input_types** | [**string[]**](../Model/string.md)| Filter by input types | [optional] |
| **output_types** | [**string[]**](../Model/string.md)| Filter by output types | [optional] |
| **params** | [**string[]**](../Model/string.md)| Filter by params | [optional] |
| **limit** | **int**| Limit the number of results | [optional] [default to 50] |
| **offset** | **int**| Offset for pagination | [optional] [default to 0] |

### Return type

[**\AIStats\Sdk\Model\ListModels200Response**](../Model/ListModels200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `listOAuthClients()`

```php
listOAuthClients(): \AIStats\Sdk\Model\ListOAuthClients200Response
```

List OAuth clients

Lists OAuth clients for the authenticated team.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);

try {
    $result = $apiInstance->listOAuthClients();
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->listOAuthClients: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**\AIStats\Sdk\Model\ListOAuthClients200Response**](../Model/ListOAuthClients200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `listOrganisations()`

```php
listOrganisations($limit, $offset): \AIStats\Sdk\Model\ListOrganisations200Response
```

List organisations

Returns a list of available organisations.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$limit = 50; // int | Limit the number of results
$offset = 0; // int | Offset for pagination

try {
    $result = $apiInstance->listOrganisations($limit, $offset);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->listOrganisations: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **limit** | **int**| Limit the number of results | [optional] [default to 50] |
| **offset** | **int**| Offset for pagination | [optional] [default to 0] |

### Return type

[**\AIStats\Sdk\Model\ListOrganisations200Response**](../Model/ListOrganisations200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `listPricingModels()`

```php
listPricingModels(): \AIStats\Sdk\Model\ListPricingModels200Response
```

List pricing models

Returns active provider/model pricing entries.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);

try {
    $result = $apiInstance->listPricingModels();
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->listPricingModels: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**\AIStats\Sdk\Model\ListPricingModels200Response**](../Model/ListPricingModels200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `listProviders()`

```php
listProviders($limit, $offset): \AIStats\Sdk\Model\ListProviders200Response
```

List providers

Returns a list of available API providers.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$limit = 50; // int | Limit the number of results
$offset = 0; // int | Offset for pagination

try {
    $result = $apiInstance->listProviders($limit, $offset);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->listProviders: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **limit** | **int**| Limit the number of results | [optional] [default to 50] |
| **offset** | **int**| Offset for pagination | [optional] [default to 0] |

### Return type

[**\AIStats\Sdk\Model\ListProviders200Response**](../Model/ListProviders200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `listProvisioningKeys()`

```php
listProvisioningKeys($team_id, $limit, $offset): \AIStats\Sdk\Model\ListProvisioningKeys200Response
```

List management API keys

Returns all management API keys for a team.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$team_id = 'team_id_example'; // string | The team ID to query
$limit = 50; // int | Maximum number of keys to return
$offset = 0; // int | Pagination offset

try {
    $result = $apiInstance->listProvisioningKeys($team_id, $limit, $offset);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->listProvisioningKeys: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **team_id** | **string**| The team ID to query | |
| **limit** | **int**| Maximum number of keys to return | [optional] [default to 50] |
| **offset** | **int**| Pagination offset | [optional] [default to 0] |

### Return type

[**\AIStats\Sdk\Model\ListProvisioningKeys200Response**](../Model/ListProvisioningKeys200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `listProvisioningKeysAlias()`

```php
listProvisioningKeysAlias($team_id, $limit, $offset): \AIStats\Sdk\Model\ListProvisioningKeysAlias200Response
```

List provisioning keys

Alias of management keys endpoint.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$team_id = 'team_id_example'; // string | The team ID to query
$limit = 50; // int | Maximum number of keys to return
$offset = 0; // int | Pagination offset

try {
    $result = $apiInstance->listProvisioningKeysAlias($team_id, $limit, $offset);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->listProvisioningKeysAlias: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **team_id** | **string**| The team ID to query | |
| **limit** | **int**| Maximum number of keys to return | [optional] [default to 50] |
| **offset** | **int**| Pagination offset | [optional] [default to 0] |

### Return type

[**\AIStats\Sdk\Model\ListProvisioningKeysAlias200Response**](../Model/ListProvisioningKeysAlias200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `regenerateOAuthClientSecret()`

```php
regenerateOAuthClientSecret($client_id): array<string,mixed>
```

Regenerate OAuth client secret

Regenerates and returns a new OAuth client secret.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$client_id = 'client_id_example'; // string

try {
    $result = $apiInstance->regenerateOAuthClientSecret($client_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->regenerateOAuthClientSecret: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **client_id** | **string**|  | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `retrieveBatch()`

```php
retrieveBatch($batch_id): \AIStats\Sdk\Model\BatchResponse
```

Retrieve batch

Retrieves a batch.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$batch_id = 'batch_id_example'; // string | The ID of the batch to retrieve.

try {
    $result = $apiInstance->retrieveBatch($batch_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->retrieveBatch: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **batch_id** | **string**| The ID of the batch to retrieve. | |

### Return type

[**\AIStats\Sdk\Model\BatchResponse**](../Model/BatchResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `retrieveBatchAlias()`

```php
retrieveBatchAlias($id): \AIStats\Sdk\Model\BatchResponse
```

Retrieve batch (alias)

Alias of /batches/{batch_id}.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$id = 'id_example'; // string

try {
    $result = $apiInstance->retrieveBatchAlias($id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->retrieveBatchAlias: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **string**|  | |

### Return type

[**\AIStats\Sdk\Model\BatchResponse**](../Model/BatchResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `retrieveFile()`

```php
retrieveFile($file_id): \AIStats\Sdk\Model\FileResponse
```

Retrieve file

Returns information about a specific file.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$file_id = 'file_id_example'; // string | The ID of the file to retrieve.

try {
    $result = $apiInstance->retrieveFile($file_id);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->retrieveFile: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **file_id** | **string**| The ID of the file to retrieve. | |

### Return type

[**\AIStats\Sdk\Model\FileResponse**](../Model/FileResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `root()`

```php
root(): \AIStats\Sdk\Model\Root200Response
```

Root endpoint

Returns a welcome message.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);

try {
    $result = $apiInstance->root();
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->root: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**\AIStats\Sdk\Model\Root200Response**](../Model/Root200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `updateOAuthClient()`

```php
updateOAuthClient($client_id, $request_body): array<string,mixed>
```

Update OAuth client

Updates OAuth client metadata and redirect URIs.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$client_id = 'client_id_example'; // string
$request_body = NULL; // array<string,mixed>

try {
    $result = $apiInstance->updateOAuthClient($client_id, $request_body);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->updateOAuthClient: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **client_id** | **string**|  | |
| **request_body** | [**array<string,mixed>**](../Model/mixed.md)|  | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `updateProvisioningKey()`

```php
updateProvisioningKey($id, $update_provisioning_key_request): \AIStats\Sdk\Model\UpdateProvisioningKey200Response
```

Update management API key

Updates the name, status, or blocked state of a management API key.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$id = 'id_example'; // string | The management API key ID
$update_provisioning_key_request = new \AIStats\Sdk\Model\UpdateProvisioningKeyRequest(); // \AIStats\Sdk\Model\UpdateProvisioningKeyRequest

try {
    $result = $apiInstance->updateProvisioningKey($id, $update_provisioning_key_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->updateProvisioningKey: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **string**| The management API key ID | |
| **update_provisioning_key_request** | [**\AIStats\Sdk\Model\UpdateProvisioningKeyRequest**](../Model/UpdateProvisioningKeyRequest.md)|  | |

### Return type

[**\AIStats\Sdk\Model\UpdateProvisioningKey200Response**](../Model/UpdateProvisioningKey200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `updateProvisioningKeyAlias()`

```php
updateProvisioningKeyAlias($id, $request_body): array<string,mixed>
```

Update provisioning key

Alias of management key update endpoint.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$id = 'id_example'; // string
$request_body = NULL; // array<string,mixed>

try {
    $result = $apiInstance->updateProvisioningKeyAlias($id, $request_body);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->updateProvisioningKeyAlias: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **string**|  | |
| **request_body** | [**array<string,mixed>**](../Model/mixed.md)|  | |

### Return type

**array<string,mixed>**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `uploadFile()`

```php
uploadFile($file, $purpose): \AIStats\Sdk\Model\FileResponse
```

Upload file

Upload a file that can be used across various endpoints.

### Example

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');


// Configure Bearer authorization: BearerAuth
$config = AIStats\Sdk\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new AIStats\Sdk\Api\DefaultApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$file = '/path/to/file.txt'; // \SplFileObject
$purpose = 'purpose_example'; // string

try {
    $result = $apiInstance->uploadFile($file, $purpose);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->uploadFile: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **file** | **\SplFileObject****\SplFileObject**|  | |
| **purpose** | **string**|  | |

### Return type

[**\AIStats\Sdk\Model\FileResponse**](../Model/FileResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: `multipart/form-data`
- **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)
