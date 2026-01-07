# AIStatsSdk

A gateway API for accessing various AI models with OpenAI-compatible endpoints.


## Installation & Usage

### Requirements

PHP 8.1 and later.

### Composer

To install the bindings via [Composer](https://getcomposer.org/), add the following to `composer.json`:

```json
{
  "repositories": [
    {
      "type": "vcs",
      "url": "https://github.com/GIT_USER_ID/GIT_REPO_ID.git"
    }
  ],
  "require": {
    "GIT_USER_ID/GIT_REPO_ID": "*@dev"
  }
}
```

Then run `composer install`

### Manual Installation

Download the files and include `autoload.php`:

```php
<?php
require_once('/path/to/AIStatsSdk/vendor/autoload.php');
```

## Getting Started

Please follow the [installation procedure](#installation--usage) and then run the following:

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

## API Endpoints

All URIs are relative to *https://api.ai-stats.phaseo.app/v1*

Class | Method | HTTP request | Description
------------ | ------------- | ------------- | -------------
*DefaultApi* | [**createBatch**](docs/Api/DefaultApi.md#createbatch) | **POST** /batches | Create batch
*DefaultApi* | [**createChatCompletion**](docs/Api/DefaultApi.md#createchatcompletion) | **POST** /chat/completions | Create chat completion
*DefaultApi* | [**createEmbedding**](docs/Api/DefaultApi.md#createembedding) | **POST** /embeddings | Create embeddings
*DefaultApi* | [**createImage**](docs/Api/DefaultApi.md#createimage) | **POST** /images/generations | Create image
*DefaultApi* | [**createImageEdit**](docs/Api/DefaultApi.md#createimageedit) | **POST** /images/edits | Create image edit
*DefaultApi* | [**createModeration**](docs/Api/DefaultApi.md#createmoderation) | **POST** /moderations | Create moderation
*DefaultApi* | [**createResponse**](docs/Api/DefaultApi.md#createresponse) | **POST** /responses | Create response
*DefaultApi* | [**createSpeech**](docs/Api/DefaultApi.md#createspeech) | **POST** /audio/speech | Generate speech
*DefaultApi* | [**createTranscription**](docs/Api/DefaultApi.md#createtranscription) | **POST** /audio/transcriptions | Create transcription
*DefaultApi* | [**createTranslation**](docs/Api/DefaultApi.md#createtranslation) | **POST** /audio/translations | Create translation
*DefaultApi* | [**createVideo**](docs/Api/DefaultApi.md#createvideo) | **POST** /videos | Create video
*DefaultApi* | [**getAnalytics**](docs/Api/DefaultApi.md#getanalytics) | **POST** /analytics | Get analytics
*DefaultApi* | [**getGeneration**](docs/Api/DefaultApi.md#getgeneration) | **GET** /generation | Get generation
*DefaultApi* | [**healthz**](docs/Api/DefaultApi.md#healthz) | **GET** /healthz | Health check
*DefaultApi* | [**listFiles**](docs/Api/DefaultApi.md#listfiles) | **GET** /files | List files
*DefaultApi* | [**listModels**](docs/Api/DefaultApi.md#listmodels) | **GET** /models | List models
*DefaultApi* | [**retrieveBatch**](docs/Api/DefaultApi.md#retrievebatch) | **GET** /batches/{batch_id} | Retrieve batch
*DefaultApi* | [**retrieveFile**](docs/Api/DefaultApi.md#retrievefile) | **GET** /files/{file_id} | Retrieve file
*DefaultApi* | [**root**](docs/Api/DefaultApi.md#root) | **GET** / | Root endpoint
*DefaultApi* | [**uploadFile**](docs/Api/DefaultApi.md#uploadfile) | **POST** /files | Upload file

## Models

- [AudioContentPart](docs/Model/AudioContentPart.md)
- [AudioContentPartInputAudio](docs/Model/AudioContentPartInputAudio.md)
- [AudioSpeechRequest](docs/Model/AudioSpeechRequest.md)
- [AudioTranscriptionResponse](docs/Model/AudioTranscriptionResponse.md)
- [AudioTranslationResponse](docs/Model/AudioTranslationResponse.md)
- [BatchRequest](docs/Model/BatchRequest.md)
- [BatchRequestCounts](docs/Model/BatchRequestCounts.md)
- [BatchResponse](docs/Model/BatchResponse.md)
- [BenchmarkId](docs/Model/BenchmarkId.md)
- [ChatChoice](docs/Model/ChatChoice.md)
- [ChatCompletionsRequest](docs/Model/ChatCompletionsRequest.md)
- [ChatCompletionsRequestResponseFormat](docs/Model/ChatCompletionsRequestResponseFormat.md)
- [ChatCompletionsRequestResponseFormatOneOf](docs/Model/ChatCompletionsRequestResponseFormatOneOf.md)
- [ChatCompletionsRequestToolChoice](docs/Model/ChatCompletionsRequestToolChoice.md)
- [ChatCompletionsRequestToolsInner](docs/Model/ChatCompletionsRequestToolsInner.md)
- [ChatCompletionsResponse](docs/Model/ChatCompletionsResponse.md)
- [ChatMessage](docs/Model/ChatMessage.md)
- [ChatMessageContent](docs/Model/ChatMessageContent.md)
- [Embedding](docs/Model/Embedding.md)
- [EmbeddingsRequest](docs/Model/EmbeddingsRequest.md)
- [EmbeddingsRequestInput](docs/Model/EmbeddingsRequestInput.md)
- [EmbeddingsResponse](docs/Model/EmbeddingsResponse.md)
- [FileResponse](docs/Model/FileResponse.md)
- [GenerationResponse](docs/Model/GenerationResponse.md)
- [GenerationResponseUsage](docs/Model/GenerationResponseUsage.md)
- [GetAnalytics200Response](docs/Model/GetAnalytics200Response.md)
- [GetAnalyticsRequest](docs/Model/GetAnalyticsRequest.md)
- [GetGeneration401Response](docs/Model/GetGeneration401Response.md)
- [GetGeneration404Response](docs/Model/GetGeneration404Response.md)
- [Healthz200Response](docs/Model/Healthz200Response.md)
- [Image](docs/Model/Image.md)
- [ImageContentPart](docs/Model/ImageContentPart.md)
- [ImageContentPartImageUrl](docs/Model/ImageContentPartImageUrl.md)
- [ImageModerationInput](docs/Model/ImageModerationInput.md)
- [ImagesEditResponse](docs/Model/ImagesEditResponse.md)
- [ImagesGenerationRequest](docs/Model/ImagesGenerationRequest.md)
- [ImagesGenerationResponse](docs/Model/ImagesGenerationResponse.md)
- [ListFilesResponse](docs/Model/ListFilesResponse.md)
- [ListModels200Response](docs/Model/ListModels200Response.md)
- [ListModels500Response](docs/Model/ListModels500Response.md)
- [ListModelsOrganisationParameter](docs/Model/ListModelsOrganisationParameter.md)
- [MessageContentPart](docs/Model/MessageContentPart.md)
- [Model](docs/Model/Model.md)
- [ModelId](docs/Model/ModelId.md)
- [ModelProvidersInner](docs/Model/ModelProvidersInner.md)
- [ModerationCategories](docs/Model/ModerationCategories.md)
- [ModerationCategoryScores](docs/Model/ModerationCategoryScores.md)
- [ModerationResult](docs/Model/ModerationResult.md)
- [ModerationsRequest](docs/Model/ModerationsRequest.md)
- [ModerationsRequestInput](docs/Model/ModerationsRequestInput.md)
- [ModerationsRequestInputOneOfInner](docs/Model/ModerationsRequestInputOneOfInner.md)
- [ModerationsResponse](docs/Model/ModerationsResponse.md)
- [OrganisationId](docs/Model/OrganisationId.md)
- [ReasoningConfig](docs/Model/ReasoningConfig.md)
- [ReasoningConfigOneOf](docs/Model/ReasoningConfigOneOf.md)
- [ReasoningConfigOneOf1](docs/Model/ReasoningConfigOneOf1.md)
- [ResponsesRequest](docs/Model/ResponsesRequest.md)
- [ResponsesRequestPrompt](docs/Model/ResponsesRequestPrompt.md)
- [ResponsesRequestReasoning](docs/Model/ResponsesRequestReasoning.md)
- [ResponsesResponse](docs/Model/ResponsesResponse.md)
- [Root200Response](docs/Model/Root200Response.md)
- [TextContentPart](docs/Model/TextContentPart.md)
- [TextModerationInput](docs/Model/TextModerationInput.md)
- [ToolCall](docs/Model/ToolCall.md)
- [ToolCallContentPart](docs/Model/ToolCallContentPart.md)
- [ToolCallContentPartFunction](docs/Model/ToolCallContentPartFunction.md)
- [ToolCallFunction](docs/Model/ToolCallFunction.md)
- [Usage](docs/Model/Usage.md)
- [VideoContentPart](docs/Model/VideoContentPart.md)
- [VideoGenerationRequest](docs/Model/VideoGenerationRequest.md)
- [VideoGenerationResponse](docs/Model/VideoGenerationResponse.md)
- [VideoGenerationResponseOutputInner](docs/Model/VideoGenerationResponseOutputInner.md)

## Authorization

Authentication schemes defined for the API:
### BearerAuth

- **Type**: Bearer authentication

## Tests

To run the tests, use:

```bash
composer install
vendor/bin/phpunit
```

## Author



## About this package

This PHP package is automatically generated by the [OpenAPI Generator](https://openapi-generator.tech) project:

- API version: `1.0.0`
    - Generator version: `7.17.0`
- Build package: `org.openapitools.codegen.languages.PhpClientCodegen`
