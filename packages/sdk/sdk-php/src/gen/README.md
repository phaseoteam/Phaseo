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
$anthropic_messages_request = new \AIStats\Sdk\Model\AnthropicMessagesRequest(); // \AIStats\Sdk\Model\AnthropicMessagesRequest

try {
    $result = $apiInstance->createAnthropicMessage($anthropic_messages_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->createAnthropicMessage: ', $e->getMessage(), PHP_EOL;
}

```

## API Endpoints

All URIs are relative to *https://api.phaseo.app/v1*

Class | Method | HTTP request | Description
------------ | ------------- | ------------- | -------------
*DefaultApi* | [**createAnthropicMessage**](docs/Api/DefaultApi.md#createanthropicmessage) | **POST** /messages | Create message
*DefaultApi* | [**createBatch**](docs/Api/DefaultApi.md#createbatch) | **POST** /batches | Create batch
*DefaultApi* | [**createChatCompletion**](docs/Api/DefaultApi.md#createchatcompletion) | **POST** /chat/completions | Create chat completion
*DefaultApi* | [**createEmbedding**](docs/Api/DefaultApi.md#createembedding) | **POST** /embeddings | Create embeddings
*DefaultApi* | [**createImage**](docs/Api/DefaultApi.md#createimage) | **POST** /images/generations | Create image
*DefaultApi* | [**createImageEdit**](docs/Api/DefaultApi.md#createimageedit) | **POST** /images/edits | Create image edit
*DefaultApi* | [**createModeration**](docs/Api/DefaultApi.md#createmoderation) | **POST** /moderations | Create moderation
*DefaultApi* | [**createOcr**](docs/Api/DefaultApi.md#createocr) | **POST** /ocr | Create OCR
*DefaultApi* | [**createProvisioningKey**](docs/Api/DefaultApi.md#createprovisioningkey) | **POST** /provisioning/keys | Create provisioning key
*DefaultApi* | [**createResponse**](docs/Api/DefaultApi.md#createresponse) | **POST** /responses | Create response
*DefaultApi* | [**createSpeech**](docs/Api/DefaultApi.md#createspeech) | **POST** /audio/speech | Generate speech
*DefaultApi* | [**createTranscription**](docs/Api/DefaultApi.md#createtranscription) | **POST** /audio/transcriptions | Create transcription
*DefaultApi* | [**createTranslation**](docs/Api/DefaultApi.md#createtranslation) | **POST** /audio/translations | Create translation
*DefaultApi* | [**createVideo**](docs/Api/DefaultApi.md#createvideo) | **POST** /videos | Create video
*DefaultApi* | [**deleteProvisioningKey**](docs/Api/DefaultApi.md#deleteprovisioningkey) | **DELETE** /provisioning/keys/{id} | Delete provisioning key
*DefaultApi* | [**deleteVideo**](docs/Api/DefaultApi.md#deletevideo) | **DELETE** /videos/{video_id} | Delete video
*DefaultApi* | [**generateMusic**](docs/Api/DefaultApi.md#generatemusic) | **POST** /music/generate | Generate music
*DefaultApi* | [**getActivity**](docs/Api/DefaultApi.md#getactivity) | **GET** /activity | Get activity
*DefaultApi* | [**getAnalytics**](docs/Api/DefaultApi.md#getanalytics) | **POST** /analytics | Get analytics
*DefaultApi* | [**getCredits**](docs/Api/DefaultApi.md#getcredits) | **GET** /credits | Get remaining credits
*DefaultApi* | [**getGeneration**](docs/Api/DefaultApi.md#getgeneration) | **GET** /generation | Get generation
*DefaultApi* | [**getProvisioningKey**](docs/Api/DefaultApi.md#getprovisioningkey) | **GET** /provisioning/keys/{id} | Get provisioning key
*DefaultApi* | [**getVideo**](docs/Api/DefaultApi.md#getvideo) | **GET** /videos/{video_id} | Get video status
*DefaultApi* | [**getVideoContent**](docs/Api/DefaultApi.md#getvideocontent) | **GET** /videos/{video_id}/content | Get video content
*DefaultApi* | [**health**](docs/Api/DefaultApi.md#health) | **GET** /health | Health check
*DefaultApi* | [**listFiles**](docs/Api/DefaultApi.md#listfiles) | **GET** /files | List files
*DefaultApi* | [**listModels**](docs/Api/DefaultApi.md#listmodels) | **GET** /models | List models
*DefaultApi* | [**listProviders**](docs/Api/DefaultApi.md#listproviders) | **GET** /providers | List providers
*DefaultApi* | [**listProvisioningKeys**](docs/Api/DefaultApi.md#listprovisioningkeys) | **GET** /provisioning/keys | List provisioning keys
*DefaultApi* | [**retrieveBatch**](docs/Api/DefaultApi.md#retrievebatch) | **GET** /batches/{batch_id} | Retrieve batch
*DefaultApi* | [**retrieveFile**](docs/Api/DefaultApi.md#retrievefile) | **GET** /files/{file_id} | Retrieve file
*DefaultApi* | [**root**](docs/Api/DefaultApi.md#root) | **GET** / | Root endpoint
*DefaultApi* | [**updateProvisioningKey**](docs/Api/DefaultApi.md#updateprovisioningkey) | **PATCH** /provisioning/keys/{id} | Update provisioning key
*DefaultApi* | [**uploadFile**](docs/Api/DefaultApi.md#uploadfile) | **POST** /files | Upload file

## Models

- [ActivityEntry](docs/Model/ActivityEntry.md)
- [ActivityEntryUsage](docs/Model/ActivityEntryUsage.md)
- [AnthropicContentBlock](docs/Model/AnthropicContentBlock.md)
- [AnthropicContentBlockDeltaEvent](docs/Model/AnthropicContentBlockDeltaEvent.md)
- [AnthropicContentBlockDeltaEventData](docs/Model/AnthropicContentBlockDeltaEventData.md)
- [AnthropicContentBlockImageUrl](docs/Model/AnthropicContentBlockImageUrl.md)
- [AnthropicContentBlockImageUrlOneOf](docs/Model/AnthropicContentBlockImageUrlOneOf.md)
- [AnthropicContentBlockSource](docs/Model/AnthropicContentBlockSource.md)
- [AnthropicContentBlockStartEvent](docs/Model/AnthropicContentBlockStartEvent.md)
- [AnthropicContentBlockStartEventData](docs/Model/AnthropicContentBlockStartEventData.md)
- [AnthropicContentBlockStopEvent](docs/Model/AnthropicContentBlockStopEvent.md)
- [AnthropicContentBlockStopEventData](docs/Model/AnthropicContentBlockStopEventData.md)
- [AnthropicMessage](docs/Model/AnthropicMessage.md)
- [AnthropicMessageContent](docs/Model/AnthropicMessageContent.md)
- [AnthropicMessageDeltaEvent](docs/Model/AnthropicMessageDeltaEvent.md)
- [AnthropicMessageDeltaEventData](docs/Model/AnthropicMessageDeltaEventData.md)
- [AnthropicMessageStartEvent](docs/Model/AnthropicMessageStartEvent.md)
- [AnthropicMessageStartEventData](docs/Model/AnthropicMessageStartEventData.md)
- [AnthropicMessageStartEventDataMessage](docs/Model/AnthropicMessageStartEventDataMessage.md)
- [AnthropicMessageStopEvent](docs/Model/AnthropicMessageStopEvent.md)
- [AnthropicMessagesRequest](docs/Model/AnthropicMessagesRequest.md)
- [AnthropicMessagesRequestSystem](docs/Model/AnthropicMessagesRequestSystem.md)
- [AnthropicMessagesResponse](docs/Model/AnthropicMessagesResponse.md)
- [AnthropicMessagesStreamEvent](docs/Model/AnthropicMessagesStreamEvent.md)
- [AnthropicTool](docs/Model/AnthropicTool.md)
- [AnthropicUsage](docs/Model/AnthropicUsage.md)
- [AudioContentPart](docs/Model/AudioContentPart.md)
- [AudioContentPartInputAudio](docs/Model/AudioContentPartInputAudio.md)
- [AudioSpeechRequest](docs/Model/AudioSpeechRequest.md)
- [AudioTranscriptionResponse](docs/Model/AudioTranscriptionResponse.md)
- [AudioTranslationResponse](docs/Model/AudioTranslationResponse.md)
- [BatchRequest](docs/Model/BatchRequest.md)
- [BatchRequestCounts](docs/Model/BatchRequestCounts.md)
- [BatchResponse](docs/Model/BatchResponse.md)
- [BenchmarkId](docs/Model/BenchmarkId.md)
- [CacheControl](docs/Model/CacheControl.md)
- [CacheControlCache](docs/Model/CacheControlCache.md)
- [ChatChoice](docs/Model/ChatChoice.md)
- [ChatCompletionsRequest](docs/Model/ChatCompletionsRequest.md)
- [ChatCompletionsRequestResponseFormat](docs/Model/ChatCompletionsRequestResponseFormat.md)
- [ChatCompletionsRequestResponseFormatOneOf](docs/Model/ChatCompletionsRequestResponseFormatOneOf.md)
- [ChatCompletionsRequestToolChoice](docs/Model/ChatCompletionsRequestToolChoice.md)
- [ChatCompletionsRequestToolsInner](docs/Model/ChatCompletionsRequestToolsInner.md)
- [ChatCompletionsResponse](docs/Model/ChatCompletionsResponse.md)
- [ChatCompletionsResponseUpstreamRequest](docs/Model/ChatCompletionsResponseUpstreamRequest.md)
- [ChatCompletionsStreamChoice](docs/Model/ChatCompletionsStreamChoice.md)
- [ChatCompletionsStreamChunk](docs/Model/ChatCompletionsStreamChunk.md)
- [ChatCompletionsStreamDelta](docs/Model/ChatCompletionsStreamDelta.md)
- [ChatCompletionsStreamEvent](docs/Model/ChatCompletionsStreamEvent.md)
- [ChatMessage](docs/Model/ChatMessage.md)
- [ChatMessageContent](docs/Model/ChatMessageContent.md)
- [CreateProvisioningKey201Response](docs/Model/CreateProvisioningKey201Response.md)
- [CreateProvisioningKeyRequest](docs/Model/CreateProvisioningKeyRequest.md)
- [DebugOptions](docs/Model/DebugOptions.md)
- [DebugResponse](docs/Model/DebugResponse.md)
- [DeleteProvisioningKey200Response](docs/Model/DeleteProvisioningKey200Response.md)
- [Embedding](docs/Model/Embedding.md)
- [EmbeddingsRequest](docs/Model/EmbeddingsRequest.md)
- [EmbeddingsResponse](docs/Model/EmbeddingsResponse.md)
- [ErrorResponse](docs/Model/ErrorResponse.md)
- [FileResponse](docs/Model/FileResponse.md)
- [GenerationResponse](docs/Model/GenerationResponse.md)
- [GetActivity200Response](docs/Model/GetActivity200Response.md)
- [GetAnalytics200Response](docs/Model/GetAnalytics200Response.md)
- [GetAnalyticsRequest](docs/Model/GetAnalyticsRequest.md)
- [GetCredits200Response](docs/Model/GetCredits200Response.md)
- [GetCredits200ResponseCredits](docs/Model/GetCredits200ResponseCredits.md)
- [GetGeneration401Response](docs/Model/GetGeneration401Response.md)
- [GetGeneration404Response](docs/Model/GetGeneration404Response.md)
- [GetProvisioningKey200Response](docs/Model/GetProvisioningKey200Response.md)
- [Health200Response](docs/Model/Health200Response.md)
- [Image](docs/Model/Image.md)
- [ImageContentPart](docs/Model/ImageContentPart.md)
- [ImageContentPartImageUrl](docs/Model/ImageContentPartImageUrl.md)
- [ImageModerationInput](docs/Model/ImageModerationInput.md)
- [ImagesEditResponse](docs/Model/ImagesEditResponse.md)
- [ImagesGenerationRequest](docs/Model/ImagesGenerationRequest.md)
- [ImagesGenerationResponse](docs/Model/ImagesGenerationResponse.md)
- [InputImageContentPart](docs/Model/InputImageContentPart.md)
- [InputImageContentPartImageUrl](docs/Model/InputImageContentPartImageUrl.md)
- [InputTextContentPart](docs/Model/InputTextContentPart.md)
- [ListFilesResponse](docs/Model/ListFilesResponse.md)
- [ListModels200Response](docs/Model/ListModels200Response.md)
- [ListModels500Response](docs/Model/ListModels500Response.md)
- [ListModelsOrganisationParameter](docs/Model/ListModelsOrganisationParameter.md)
- [ListProviders200Response](docs/Model/ListProviders200Response.md)
- [ListProvisioningKeys200Response](docs/Model/ListProvisioningKeys200Response.md)
- [MessageContentPart](docs/Model/MessageContentPart.md)
- [Model](docs/Model/Model.md)
- [ModelId](docs/Model/ModelId.md)
- [ModelPricing](docs/Model/ModelPricing.md)
- [ModelPricingMeter](docs/Model/ModelPricingMeter.md)
- [ModelPricingMeters](docs/Model/ModelPricingMeters.md)
- [ModelProvidersInner](docs/Model/ModelProvidersInner.md)
- [ModerationCategories](docs/Model/ModerationCategories.md)
- [ModerationCategoryScores](docs/Model/ModerationCategoryScores.md)
- [ModerationResult](docs/Model/ModerationResult.md)
- [ModerationsRequest](docs/Model/ModerationsRequest.md)
- [ModerationsRequestInput](docs/Model/ModerationsRequestInput.md)
- [ModerationsRequestInputOneOfInner](docs/Model/ModerationsRequestInputOneOfInner.md)
- [ModerationsResponse](docs/Model/ModerationsResponse.md)
- [MusicGenerateRequest](docs/Model/MusicGenerateRequest.md)
- [MusicGenerateRequestElevenlabs](docs/Model/MusicGenerateRequestElevenlabs.md)
- [MusicGenerateRequestSuno](docs/Model/MusicGenerateRequestSuno.md)
- [OcrRequest](docs/Model/OcrRequest.md)
- [OrganisationId](docs/Model/OrganisationId.md)
- [PricingBreakdown](docs/Model/PricingBreakdown.md)
- [Provider](docs/Model/Provider.md)
- [ProviderRoutingOptions](docs/Model/ProviderRoutingOptions.md)
- [ProvisioningKey](docs/Model/ProvisioningKey.md)
- [ProvisioningKeyDetail](docs/Model/ProvisioningKeyDetail.md)
- [ProvisioningKeyWithValue](docs/Model/ProvisioningKeyWithValue.md)
- [ReasoningConfig](docs/Model/ReasoningConfig.md)
- [ResponsesFunctionCallItem](docs/Model/ResponsesFunctionCallItem.md)
- [ResponsesFunctionCallOutputItem](docs/Model/ResponsesFunctionCallOutputItem.md)
- [ResponsesInputAudioItem](docs/Model/ResponsesInputAudioItem.md)
- [ResponsesInputImageItem](docs/Model/ResponsesInputImageItem.md)
- [ResponsesInputItem](docs/Model/ResponsesInputItem.md)
- [ResponsesInputTextItem](docs/Model/ResponsesInputTextItem.md)
- [ResponsesInputVideoItem](docs/Model/ResponsesInputVideoItem.md)
- [ResponsesMessageItem](docs/Model/ResponsesMessageItem.md)
- [ResponsesOutputContent](docs/Model/ResponsesOutputContent.md)
- [ResponsesOutputItem](docs/Model/ResponsesOutputItem.md)
- [ResponsesRequest](docs/Model/ResponsesRequest.md)
- [ResponsesRequestInput](docs/Model/ResponsesRequestInput.md)
- [ResponsesRequestPrompt](docs/Model/ResponsesRequestPrompt.md)
- [ResponsesRequestReasoning](docs/Model/ResponsesRequestReasoning.md)
- [ResponsesResponse](docs/Model/ResponsesResponse.md)
- [ResponsesResponseReasoning](docs/Model/ResponsesResponseReasoning.md)
- [ResponsesStreamCompletedEvent](docs/Model/ResponsesStreamCompletedEvent.md)
- [ResponsesStreamCompletedEventData](docs/Model/ResponsesStreamCompletedEventData.md)
- [ResponsesStreamCreatedEvent](docs/Model/ResponsesStreamCreatedEvent.md)
- [ResponsesStreamCreatedEventData](docs/Model/ResponsesStreamCreatedEventData.md)
- [ResponsesStreamCreatedEventDataResponse](docs/Model/ResponsesStreamCreatedEventDataResponse.md)
- [ResponsesStreamErrorEvent](docs/Model/ResponsesStreamErrorEvent.md)
- [ResponsesStreamEvent](docs/Model/ResponsesStreamEvent.md)
- [ResponsesStreamFunctionCallArgumentsDeltaEvent](docs/Model/ResponsesStreamFunctionCallArgumentsDeltaEvent.md)
- [ResponsesStreamFunctionCallArgumentsDeltaEventData](docs/Model/ResponsesStreamFunctionCallArgumentsDeltaEventData.md)
- [ResponsesStreamFunctionCallArgumentsDoneEvent](docs/Model/ResponsesStreamFunctionCallArgumentsDoneEvent.md)
- [ResponsesStreamFunctionCallArgumentsDoneEventData](docs/Model/ResponsesStreamFunctionCallArgumentsDoneEventData.md)
- [ResponsesStreamOutputTextDeltaEvent](docs/Model/ResponsesStreamOutputTextDeltaEvent.md)
- [ResponsesStreamOutputTextDeltaEventData](docs/Model/ResponsesStreamOutputTextDeltaEventData.md)
- [ResponsesStreamReasoningTextDeltaEvent](docs/Model/ResponsesStreamReasoningTextDeltaEvent.md)
- [ResponsesStreamReasoningTextDeltaEventData](docs/Model/ResponsesStreamReasoningTextDeltaEventData.md)
- [Root200Response](docs/Model/Root200Response.md)
- [TextContentPart](docs/Model/TextContentPart.md)
- [TextModerationInput](docs/Model/TextModerationInput.md)
- [ToolCall](docs/Model/ToolCall.md)
- [ToolCallContentPart](docs/Model/ToolCallContentPart.md)
- [ToolCallContentPartFunction](docs/Model/ToolCallContentPartFunction.md)
- [ToolCallFunction](docs/Model/ToolCallFunction.md)
- [UpdateProvisioningKey200Response](docs/Model/UpdateProvisioningKey200Response.md)
- [UpdateProvisioningKeyRequest](docs/Model/UpdateProvisioningKeyRequest.md)
- [Usage](docs/Model/Usage.md)
- [UsageDetails](docs/Model/UsageDetails.md)
- [VideoContentPart](docs/Model/VideoContentPart.md)
- [VideoDeleteResponse](docs/Model/VideoDeleteResponse.md)
- [VideoGenerationRequest](docs/Model/VideoGenerationRequest.md)
- [VideoGenerationRequestSeconds](docs/Model/VideoGenerationRequestSeconds.md)
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
