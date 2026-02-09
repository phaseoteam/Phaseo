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
$calculate_pricing_request = new \AIStats\Sdk\Model\CalculatePricingRequest(); // \AIStats\Sdk\Model\CalculatePricingRequest

try {
    $result = $apiInstance->calculatePricing($calculate_pricing_request);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling DefaultApi->calculatePricing: ', $e->getMessage(), PHP_EOL;
}

```

## API Endpoints

All URIs are relative to *https://api.phaseo.app/v1*

Class | Method | HTTP request | Description
------------ | ------------- | ------------- | -------------
*DefaultApi* | [**calculatePricing**](docs/Api/DefaultApi.md#calculatepricing) | **POST** /pricing/calculate | Calculate pricing
*DefaultApi* | [**createAnthropicMessage**](docs/Api/DefaultApi.md#createanthropicmessage) | **POST** /messages | Create message
*DefaultApi* | [**createBatch**](docs/Api/DefaultApi.md#createbatch) | **POST** /batches | Create batch
*DefaultApi* | [**createBatchAlias**](docs/Api/DefaultApi.md#createbatchalias) | **POST** /batch | Create batch (alias)
*DefaultApi* | [**createChatCompletion**](docs/Api/DefaultApi.md#createchatcompletion) | **POST** /chat/completions | Create chat completion
*DefaultApi* | [**createEmbedding**](docs/Api/DefaultApi.md#createembedding) | **POST** /embeddings | Create embeddings
*DefaultApi* | [**createImage**](docs/Api/DefaultApi.md#createimage) | **POST** /images/generations | Create image
*DefaultApi* | [**createImageEdit**](docs/Api/DefaultApi.md#createimageedit) | **POST** /images/edits | Create image edit
*DefaultApi* | [**createKeyPlaceholder**](docs/Api/DefaultApi.md#createkeyplaceholder) | **POST** /keys | Create key (placeholder)
*DefaultApi* | [**createModeration**](docs/Api/DefaultApi.md#createmoderation) | **POST** /moderations | Create moderation
*DefaultApi* | [**createOAuthClient**](docs/Api/DefaultApi.md#createoauthclient) | **POST** /oauth-clients | Create OAuth client
*DefaultApi* | [**createOcr**](docs/Api/DefaultApi.md#createocr) | **POST** /ocr | Create OCR
*DefaultApi* | [**createResponse**](docs/Api/DefaultApi.md#createresponse) | **POST** /responses | Create response
*DefaultApi* | [**createSpeech**](docs/Api/DefaultApi.md#createspeech) | **POST** /audio/speech | Generate speech
*DefaultApi* | [**createTranscription**](docs/Api/DefaultApi.md#createtranscription) | **POST** /audio/transcriptions | Create transcription
*DefaultApi* | [**createTranslation**](docs/Api/DefaultApi.md#createtranslation) | **POST** /audio/translations | Create translation
*DefaultApi* | [**createVideo**](docs/Api/DefaultApi.md#createvideo) | **POST** /videos | Create video
*DefaultApi* | [**createVideoAlias**](docs/Api/DefaultApi.md#createvideoalias) | **POST** /video/generations | Create video (alias)
*DefaultApi* | [**deleteOAuthClient**](docs/Api/DefaultApi.md#deleteoauthclient) | **DELETE** /oauth-clients/{client_id} | Delete OAuth client
*DefaultApi* | [**deleteProvisioningKey**](docs/Api/DefaultApi.md#deleteprovisioningkey) | **DELETE** /management/keys/{id} | Delete management API key
*DefaultApi* | [**deleteProvisioningKeyAlias**](docs/Api/DefaultApi.md#deleteprovisioningkeyalias) | **DELETE** /provisioning/keys/{id} | Delete provisioning key
*DefaultApi* | [**deleteVideo**](docs/Api/DefaultApi.md#deletevideo) | **DELETE** /videos/{video_id} | Delete video
*DefaultApi* | [**deleteVideoAlias**](docs/Api/DefaultApi.md#deletevideoalias) | **DELETE** /video/generations/{video_id} | Delete video (alias)
*DefaultApi* | [**generateMusic**](docs/Api/DefaultApi.md#generatemusic) | **POST** /music/generate | Generate music
*DefaultApi* | [**generateMusicAlias**](docs/Api/DefaultApi.md#generatemusicalias) | **POST** /music/generations | Generate music (alias)
*DefaultApi* | [**getActivity**](docs/Api/DefaultApi.md#getactivity) | **GET** /activity | Get activity
*DefaultApi* | [**getAnalytics**](docs/Api/DefaultApi.md#getanalytics) | **POST** /analytics | Get analytics
*DefaultApi* | [**getCredits**](docs/Api/DefaultApi.md#getcredits) | **GET** /credits | Get remaining credits
*DefaultApi* | [**getGeneration**](docs/Api/DefaultApi.md#getgeneration) | **GET** /generations | Get generation
*DefaultApi* | [**getKeyPlaceholder**](docs/Api/DefaultApi.md#getkeyplaceholder) | **GET** /key | Get key (placeholder)
*DefaultApi* | [**getMusicGeneration**](docs/Api/DefaultApi.md#getmusicgeneration) | **GET** /music/generate/{music_id} | Get music generation status
*DefaultApi* | [**getMusicGenerationAlias**](docs/Api/DefaultApi.md#getmusicgenerationalias) | **GET** /music/generations/{music_id} | Get music generation status (alias)
*DefaultApi* | [**getOAuthClient**](docs/Api/DefaultApi.md#getoauthclient) | **GET** /oauth-clients/{client_id} | Get OAuth client
*DefaultApi* | [**getProviderDerankStatus**](docs/Api/DefaultApi.md#getproviderderankstatus) | **GET** /health/providers/{provider_id}/derank | Provider derank status
*DefaultApi* | [**getProvisioningKey**](docs/Api/DefaultApi.md#getprovisioningkey) | **GET** /management/keys/{id} | Get management API key
*DefaultApi* | [**getProvisioningKeyAlias**](docs/Api/DefaultApi.md#getprovisioningkeyalias) | **GET** /provisioning/keys/{id} | Get provisioning key
*DefaultApi* | [**getVideo**](docs/Api/DefaultApi.md#getvideo) | **GET** /videos/{video_id} | Get video status
*DefaultApi* | [**getVideoAlias**](docs/Api/DefaultApi.md#getvideoalias) | **GET** /video/generations/{video_id} | Get video status (alias)
*DefaultApi* | [**getVideoContent**](docs/Api/DefaultApi.md#getvideocontent) | **GET** /videos/{video_id}/content | Get video content
*DefaultApi* | [**getVideoContentAlias**](docs/Api/DefaultApi.md#getvideocontentalias) | **GET** /video/generations/{video_id}/content | Get video content (alias)
*DefaultApi* | [**healthz**](docs/Api/DefaultApi.md#healthz) | **GET** /health | Health check
*DefaultApi* | [**invalidateGatewayKeyCache**](docs/Api/DefaultApi.md#invalidategatewaykeycache) | **POST** /keys/{id}/invalidate | Invalidate key cache
*DefaultApi* | [**listEndpointsPlaceholder**](docs/Api/DefaultApi.md#listendpointsplaceholder) | **GET** /endpoints | List endpoints (placeholder)
*DefaultApi* | [**listFiles**](docs/Api/DefaultApi.md#listfiles) | **GET** /files | List files
*DefaultApi* | [**listKeysPlaceholder**](docs/Api/DefaultApi.md#listkeysplaceholder) | **GET** /keys | List keys (placeholder)
*DefaultApi* | [**listModels**](docs/Api/DefaultApi.md#listmodels) | **GET** /models | List models
*DefaultApi* | [**listOAuthClients**](docs/Api/DefaultApi.md#listoauthclients) | **GET** /oauth-clients | List OAuth clients
*DefaultApi* | [**listOrganisations**](docs/Api/DefaultApi.md#listorganisations) | **GET** /organisations | List organisations
*DefaultApi* | [**listPricingModels**](docs/Api/DefaultApi.md#listpricingmodels) | **GET** /pricing/models | List pricing models
*DefaultApi* | [**listProviders**](docs/Api/DefaultApi.md#listproviders) | **GET** /providers | List providers
*DefaultApi* | [**listProvisioningKeys**](docs/Api/DefaultApi.md#listprovisioningkeys) | **GET** /management/keys | List management API keys
*DefaultApi* | [**listProvisioningKeysAlias**](docs/Api/DefaultApi.md#listprovisioningkeysalias) | **GET** /provisioning/keys | List provisioning keys
*DefaultApi* | [**regenerateOAuthClientSecret**](docs/Api/DefaultApi.md#regenerateoauthclientsecret) | **POST** /oauth-clients/{client_id}/regenerate-secret | Regenerate OAuth client secret
*DefaultApi* | [**retrieveBatch**](docs/Api/DefaultApi.md#retrievebatch) | **GET** /batches/{batch_id} | Retrieve batch
*DefaultApi* | [**retrieveBatchAlias**](docs/Api/DefaultApi.md#retrievebatchalias) | **GET** /batch/{id} | Retrieve batch (alias)
*DefaultApi* | [**retrieveFile**](docs/Api/DefaultApi.md#retrievefile) | **GET** /files/{file_id} | Retrieve file
*DefaultApi* | [**root**](docs/Api/DefaultApi.md#root) | **GET** / | Root endpoint
*DefaultApi* | [**updateOAuthClient**](docs/Api/DefaultApi.md#updateoauthclient) | **PATCH** /oauth-clients/{client_id} | Update OAuth client
*DefaultApi* | [**updateProvisioningKey**](docs/Api/DefaultApi.md#updateprovisioningkey) | **PATCH** /management/keys/{id} | Update management API key
*DefaultApi* | [**updateProvisioningKeyAlias**](docs/Api/DefaultApi.md#updateprovisioningkeyalias) | **PATCH** /provisioning/keys/{id} | Update provisioning key
*DefaultApi* | [**uploadFile**](docs/Api/DefaultApi.md#uploadfile) | **POST** /files | Upload file

## Models

- [ActivityEntry](docs/Model/ActivityEntry.md)
- [ActivityEntryUsage](docs/Model/ActivityEntryUsage.md)
- [AnthropicContentBlock](docs/Model/AnthropicContentBlock.md)
- [AnthropicContentBlockSource](docs/Model/AnthropicContentBlockSource.md)
- [AnthropicMessage](docs/Model/AnthropicMessage.md)
- [AnthropicMessageContent](docs/Model/AnthropicMessageContent.md)
- [AnthropicMessagesRequest](docs/Model/AnthropicMessagesRequest.md)
- [AnthropicMessagesRequestSystem](docs/Model/AnthropicMessagesRequestSystem.md)
- [AnthropicMessagesResponse](docs/Model/AnthropicMessagesResponse.md)
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
- [CalculatePricing200Response](docs/Model/CalculatePricing200Response.md)
- [CalculatePricingRequest](docs/Model/CalculatePricingRequest.md)
- [ChatChoice](docs/Model/ChatChoice.md)
- [ChatCompletionsRequest](docs/Model/ChatCompletionsRequest.md)
- [ChatCompletionsRequestResponseFormat](docs/Model/ChatCompletionsRequestResponseFormat.md)
- [ChatCompletionsRequestResponseFormatOneOf](docs/Model/ChatCompletionsRequestResponseFormatOneOf.md)
- [ChatCompletionsRequestToolChoice](docs/Model/ChatCompletionsRequestToolChoice.md)
- [ChatCompletionsRequestToolsInner](docs/Model/ChatCompletionsRequestToolsInner.md)
- [ChatCompletionsResponse](docs/Model/ChatCompletionsResponse.md)
- [ChatMessage](docs/Model/ChatMessage.md)
- [ChatMessageContent](docs/Model/ChatMessageContent.md)
- [CreateOAuthClientRequest](docs/Model/CreateOAuthClientRequest.md)
- [DebugOptions](docs/Model/DebugOptions.md)
- [DeleteProvisioningKey200Response](docs/Model/DeleteProvisioningKey200Response.md)
- [Embedding](docs/Model/Embedding.md)
- [EmbeddingsRequest](docs/Model/EmbeddingsRequest.md)
- [EmbeddingsResponse](docs/Model/EmbeddingsResponse.md)
- [ErrorResponse](docs/Model/ErrorResponse.md)
- [FileResponse](docs/Model/FileResponse.md)
- [GenerationResponse](docs/Model/GenerationResponse.md)
- [GenerationResponseUsage](docs/Model/GenerationResponseUsage.md)
- [GetActivity200Response](docs/Model/GetActivity200Response.md)
- [GetAnalytics200Response](docs/Model/GetAnalytics200Response.md)
- [GetAnalyticsRequest](docs/Model/GetAnalyticsRequest.md)
- [GetCredits200Response](docs/Model/GetCredits200Response.md)
- [GetCredits200ResponseCredits](docs/Model/GetCredits200ResponseCredits.md)
- [GetGeneration401Response](docs/Model/GetGeneration401Response.md)
- [GetGeneration404Response](docs/Model/GetGeneration404Response.md)
- [GetProvisioningKey200Response](docs/Model/GetProvisioningKey200Response.md)
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
- [ListOAuthClients200Response](docs/Model/ListOAuthClients200Response.md)
- [ListOrganisations200Response](docs/Model/ListOrganisations200Response.md)
- [ListOrganisations200ResponseOrganisationsInner](docs/Model/ListOrganisations200ResponseOrganisationsInner.md)
- [ListPricingModels200Response](docs/Model/ListPricingModels200Response.md)
- [ListProviders200Response](docs/Model/ListProviders200Response.md)
- [ListProvisioningKeys200Response](docs/Model/ListProvisioningKeys200Response.md)
- [ListProvisioningKeysAlias200Response](docs/Model/ListProvisioningKeysAlias200Response.md)
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
- [MusicGenerateRequest](docs/Model/MusicGenerateRequest.md)
- [MusicGenerateRequestElevenlabs](docs/Model/MusicGenerateRequestElevenlabs.md)
- [MusicGenerateRequestSuno](docs/Model/MusicGenerateRequestSuno.md)
- [OcrRequest](docs/Model/OcrRequest.md)
- [OrganisationId](docs/Model/OrganisationId.md)
- [Provider](docs/Model/Provider.md)
- [ProviderRoutingOptions](docs/Model/ProviderRoutingOptions.md)
- [ProvisioningKey](docs/Model/ProvisioningKey.md)
- [ProvisioningKeyDetail](docs/Model/ProvisioningKeyDetail.md)
- [ProvisioningKeyWithValue](docs/Model/ProvisioningKeyWithValue.md)
- [ReasoningConfig](docs/Model/ReasoningConfig.md)
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
- [UpdateProvisioningKey200Response](docs/Model/UpdateProvisioningKey200Response.md)
- [UpdateProvisioningKeyRequest](docs/Model/UpdateProvisioningKeyRequest.md)
- [Usage](docs/Model/Usage.md)
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
