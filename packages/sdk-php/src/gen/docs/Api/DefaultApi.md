# AIStats\Sdk\DefaultApi

All URIs are relative to https://api.phaseo.app/v1, except if the operation defines another base path.

| Method                                                           | HTTP request                   | Description            |
| ---------------------------------------------------------------- | ------------------------------ | ---------------------- |
| [**createBatch()**](DefaultApi.md#createBatch)                   | **POST** /batches              | Create batch           |
| [**createChatCompletion()**](DefaultApi.md#createChatCompletion) | **POST** /chat/completions     | Create chat completion |
| [**createEmbedding()**](DefaultApi.md#createEmbedding)           | **POST** /embeddings           | Create embeddings      |
| [**createImage()**](DefaultApi.md#createImage)                   | **POST** /images/generations   | Create image           |
| [**createImageEdit()**](DefaultApi.md#createImageEdit)           | **POST** /images/edits         | Create image edit      |
| [**createModeration()**](DefaultApi.md#createModeration)         | **POST** /moderations          | Create moderation      |
| [**createResponse()**](DefaultApi.md#createResponse)             | **POST** /responses            | Create response        |
| [**createSpeech()**](DefaultApi.md#createSpeech)                 | **POST** /audio/speech         | Generate speech        |
| [**createTranscription()**](DefaultApi.md#createTranscription)   | **POST** /audio/transcriptions | Create transcription   |
| [**createTranslation()**](DefaultApi.md#createTranslation)       | **POST** /audio/translations   | Create translation     |
| [**createVideo()**](DefaultApi.md#createVideo)                   | **POST** /videos               | Create video           |
| [**getAnalytics()**](DefaultApi.md#getAnalytics)                 | **POST** /analytics            | Get analytics          |
| [**getGeneration()**](DefaultApi.md#getGeneration)               | **GET** /generation            | Get generation         |
| [**healthz()**](DefaultApi.md#healthz)                           | **GET** /healthz               | Health check           |
| [**listFiles()**](DefaultApi.md#listFiles)                       | **GET** /files                 | List files             |
| [**listModels()**](DefaultApi.md#listModels)                     | **GET** /models                | List models            |
| [**retrieveBatch()**](DefaultApi.md#retrieveBatch)               | **GET** /batches/{batch_id}    | Retrieve batch         |
| [**retrieveFile()**](DefaultApi.md#retrieveFile)                 | **GET** /files/{file_id}       | Retrieve file          |
| [**root()**](DefaultApi.md#root)                                 | **GET** /                      | Root endpoint          |
| [**uploadFile()**](DefaultApi.md#uploadFile)                     | **POST** /files                | Upload file            |

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

| Name              | Type                                                            | Description | Notes |
| ----------------- | --------------------------------------------------------------- | ----------- | ----- |
| **batch_request** | [**\AIStats\Sdk\Model\BatchRequest**](../Model/BatchRequest.md) |             |       |

### Return type

[**\AIStats\Sdk\Model\BatchResponse**](../Model/BatchResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: `application/json`
-   **Accept**: `application/json`

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

| Name                         | Type                                                                                | Description | Notes |
| ---------------------------- | ----------------------------------------------------------------------------------- | ----------- | ----- |
| **chat_completions_request** | [**\AIStats\Sdk\Model\ChatCompletionsRequest**](../Model/ChatCompletionsRequest.md) |             |       |

### Return type

[**\AIStats\Sdk\Model\ChatCompletionsResponse**](../Model/ChatCompletionsResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: `application/json`
-   **Accept**: `application/json`

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

| Name                   | Type                                                                      | Description | Notes |
| ---------------------- | ------------------------------------------------------------------------- | ----------- | ----- |
| **embeddings_request** | [**\AIStats\Sdk\Model\EmbeddingsRequest**](../Model/EmbeddingsRequest.md) |             |       |

### Return type

[**\AIStats\Sdk\Model\EmbeddingsResponse**](../Model/EmbeddingsResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: `application/json`
-   **Accept**: `application/json`

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

| Name                          | Type                                                                                  | Description | Notes |
| ----------------------------- | ------------------------------------------------------------------------------------- | ----------- | ----- |
| **images_generation_request** | [**\AIStats\Sdk\Model\ImagesGenerationRequest**](../Model/ImagesGenerationRequest.md) |             |       |

### Return type

[**\AIStats\Sdk\Model\ImagesGenerationResponse**](../Model/ImagesGenerationResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: `application/json`
-   **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createImageEdit()`

```php
createImageEdit($model, $image, $prompt, $mask, $size, $n, $user, $meta, $usage): \AIStats\Sdk\Model\ImagesEditResponse
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

try {
    $result = $apiInstance->createImageEdit($model, $image, $prompt, $mask, $size, $n, $user, $meta, $usage);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createImageEdit: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name       | Type       | Description | Notes      |
| ---------- | ---------- | ----------- | ---------- |
| **model**  | **string** |             |            |
| **image**  | **string** |             |            |
| **prompt** | **string** |             |            |
| **mask**   | **string** |             | [optional] |
| **size**   | **string** |             | [optional] |
| **n**      | **int**    |             | [optional] |
| **user**   | **string** |             | [optional] |
| **meta**   | **bool**   |             | [optional] |
| **usage**  | **bool**   |             | [optional] |

### Return type

[**\AIStats\Sdk\Model\ImagesEditResponse**](../Model/ImagesEditResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: `multipart/form-data`
-   **Accept**: `application/json`

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

| Name                    | Type                                                                        | Description | Notes |
| ----------------------- | --------------------------------------------------------------------------- | ----------- | ----- |
| **moderations_request** | [**\AIStats\Sdk\Model\ModerationsRequest**](../Model/ModerationsRequest.md) |             |       |

### Return type

[**\AIStats\Sdk\Model\ModerationsResponse**](../Model/ModerationsResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: `application/json`
-   **Accept**: `application/json`

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

| Name                  | Type                                                                    | Description | Notes |
| --------------------- | ----------------------------------------------------------------------- | ----------- | ----- |
| **responses_request** | [**\AIStats\Sdk\Model\ResponsesRequest**](../Model/ResponsesRequest.md) |             |       |

### Return type

[**\AIStats\Sdk\Model\ResponsesResponse**](../Model/ResponsesResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: `application/json`
-   **Accept**: `application/json`

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

| Name                     | Type                                                                        | Description | Notes |
| ------------------------ | --------------------------------------------------------------------------- | ----------- | ----- |
| **audio_speech_request** | [**\AIStats\Sdk\Model\AudioSpeechRequest**](../Model/AudioSpeechRequest.md) |             |       |

### Return type

**\SplFileObject**

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: `application/json`
-   **Accept**: `audio/mpeg`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createTranscription()`

```php
createTranscription($model, $audio_url, $audio_b64, $language): \AIStats\Sdk\Model\AudioTranscriptionResponse
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

try {
    $result = $apiInstance->createTranscription($model, $audio_url, $audio_b64, $language);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createTranscription: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name          | Type       | Description | Notes      |
| ------------- | ---------- | ----------- | ---------- |
| **model**     | **string** |             |            |
| **audio_url** | **string** |             | [optional] |
| **audio_b64** | **string** |             | [optional] |
| **language**  | **string** |             | [optional] |

### Return type

[**\AIStats\Sdk\Model\AudioTranscriptionResponse**](../Model/AudioTranscriptionResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: `multipart/form-data`
-   **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)

## `createTranslation()`

```php
createTranslation($model, $audio_url, $audio_b64, $language, $prompt, $temperature): \AIStats\Sdk\Model\AudioTranslationResponse
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

try {
    $result = $apiInstance->createTranslation($model, $audio_url, $audio_b64, $language, $prompt, $temperature);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createTranslation: ', $e->getMessage(), PHP_EOL;
}
```

### Parameters

| Name            | Type       | Description | Notes      |
| --------------- | ---------- | ----------- | ---------- |
| **model**       | **string** |             |            |
| **audio_url**   | **string** |             | [optional] |
| **audio_b64**   | **string** |             | [optional] |
| **language**    | **string** |             | [optional] |
| **prompt**      | **string** |             | [optional] |
| **temperature** | **float**  |             | [optional] |

### Return type

[**\AIStats\Sdk\Model\AudioTranslationResponse**](../Model/AudioTranslationResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: `multipart/form-data`
-   **Accept**: `application/json`

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

| Name                         | Type                                                                                | Description | Notes |
| ---------------------------- | ----------------------------------------------------------------------------------- | ----------- | ----- |
| **video_generation_request** | [**\AIStats\Sdk\Model\VideoGenerationRequest**](../Model/VideoGenerationRequest.md) |             |       |

### Return type

[**\AIStats\Sdk\Model\VideoGenerationResponse**](../Model/VideoGenerationResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: `application/json`
-   **Accept**: `application/json`

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

| Name                      | Type                                                                          | Description | Notes |
| ------------------------- | ----------------------------------------------------------------------------- | ----------- | ----- |
| **get_analytics_request** | [**\AIStats\Sdk\Model\GetAnalyticsRequest**](../Model/GetAnalyticsRequest.md) |             |       |

### Return type

[**\AIStats\Sdk\Model\GetAnalytics200Response**](../Model/GetAnalytics200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: `application/json`
-   **Accept**: `application/json`

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

| Name   | Type       | Description              | Notes |
| ------ | ---------- | ------------------------ | ----- |
| **id** | **string** | The ID of the generation |       |

### Return type

[**\AIStats\Sdk\Model\GenerationResponse**](../Model/GenerationResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: `application/json`

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

-   **Content-Type**: Not defined
-   **Accept**: `application/json`

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

-   **Content-Type**: Not defined
-   **Accept**: `application/json`

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

| Name             | Type                                                                   | Description                 | Notes                      |
| ---------------- | ---------------------------------------------------------------------- | --------------------------- | -------------------------- |
| **endpoints**    | [**string[]**](../Model/string.md)                                     | Filter by endpoints         | [optional]                 |
| **organisation** | [**\AIStats\Sdk\Model\ListModelsOrganisationParameter**](../Model/.md) | Filter by organisation      | [optional]                 |
| **input_types**  | [**string[]**](../Model/string.md)                                     | Filter by input types       | [optional]                 |
| **output_types** | [**string[]**](../Model/string.md)                                     | Filter by output types      | [optional]                 |
| **params**       | [**string[]**](../Model/string.md)                                     | Filter by params            | [optional]                 |
| **limit**        | **int**                                                                | Limit the number of results | [optional] [default to 50] |
| **offset**       | **int**                                                                | Offset for pagination       | [optional] [default to 0]  |

### Return type

[**\AIStats\Sdk\Model\ListModels200Response**](../Model/ListModels200Response.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: `application/json`

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

| Name         | Type       | Description                      | Notes |
| ------------ | ---------- | -------------------------------- | ----- |
| **batch_id** | **string** | The ID of the batch to retrieve. |       |

### Return type

[**\AIStats\Sdk\Model\BatchResponse**](../Model/BatchResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: `application/json`

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

| Name        | Type       | Description                     | Notes |
| ----------- | ---------- | ------------------------------- | ----- |
| **file_id** | **string** | The ID of the file to retrieve. |       |

### Return type

[**\AIStats\Sdk\Model\FileResponse**](../Model/FileResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: `application/json`

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

-   **Content-Type**: Not defined
-   **Accept**: `application/json`

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

| Name        | Type                                     | Description | Notes |
| ----------- | ---------------------------------------- | ----------- | ----- |
| **file**    | **\SplFileObject\*\***\SplFileObject\*\* |             |       |
| **purpose** | **string**                               |             |       |

### Return type

[**\AIStats\Sdk\Model\FileResponse**](../Model/FileResponse.md)

### Authorization

[BearerAuth](../../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: `multipart/form-data`
-   **Accept**: `application/json`

[[Back to top]](#) [[Back to API list]](../../README.md#endpoints)
[[Back to Model list]](../../README.md#models)
[[Back to README]](../../README.md)
