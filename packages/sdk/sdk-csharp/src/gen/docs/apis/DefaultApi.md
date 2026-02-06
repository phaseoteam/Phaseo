# AIStatsSdk.Api.DefaultApi

All URIs are relative to *https://api.phaseo.app/v1*

| Method | HTTP request | Description |
|--------|--------------|-------------|
| [**CreateAnthropicMessage**](DefaultApi.md#createanthropicmessage) | **POST** /messages | Create message |
| [**CreateBatch**](DefaultApi.md#createbatch) | **POST** /batches | Create batch |
| [**CreateChatCompletion**](DefaultApi.md#createchatcompletion) | **POST** /chat/completions | Create chat completion |
| [**CreateEmbedding**](DefaultApi.md#createembedding) | **POST** /embeddings | Create embeddings |
| [**CreateImage**](DefaultApi.md#createimage) | **POST** /images/generations | Create image |
| [**CreateImageEdit**](DefaultApi.md#createimageedit) | **POST** /images/edits | Create image edit |
| [**CreateModeration**](DefaultApi.md#createmoderation) | **POST** /moderations | Create moderation |
| [**CreateOcr**](DefaultApi.md#createocr) | **POST** /ocr | Create OCR |
| [**CreateProvisioningKey**](DefaultApi.md#createprovisioningkey) | **POST** /provisioning/keys | Create provisioning key |
| [**CreateResponse**](DefaultApi.md#createresponse) | **POST** /responses | Create response |
| [**CreateSpeech**](DefaultApi.md#createspeech) | **POST** /audio/speech | Generate speech |
| [**CreateTranscription**](DefaultApi.md#createtranscription) | **POST** /audio/transcriptions | Create transcription |
| [**CreateTranslation**](DefaultApi.md#createtranslation) | **POST** /audio/translations | Create translation |
| [**CreateVideo**](DefaultApi.md#createvideo) | **POST** /videos | Create video |
| [**DeleteProvisioningKey**](DefaultApi.md#deleteprovisioningkey) | **DELETE** /provisioning/keys/{id} | Delete provisioning key |
| [**DeleteVideo**](DefaultApi.md#deletevideo) | **DELETE** /videos/{video_id} | Delete video |
| [**GenerateMusic**](DefaultApi.md#generatemusic) | **POST** /music/generate | Generate music |
| [**GetActivity**](DefaultApi.md#getactivity) | **GET** /activity | Get activity |
| [**GetAnalytics**](DefaultApi.md#getanalytics) | **POST** /analytics | Get analytics |
| [**GetCredits**](DefaultApi.md#getcredits) | **GET** /credits | Get remaining credits |
| [**GetGeneration**](DefaultApi.md#getgeneration) | **GET** /generation | Get generation |
| [**GetProvisioningKey**](DefaultApi.md#getprovisioningkey) | **GET** /provisioning/keys/{id} | Get provisioning key |
| [**GetVideo**](DefaultApi.md#getvideo) | **GET** /videos/{video_id} | Get video status |
| [**GetVideoContent**](DefaultApi.md#getvideocontent) | **GET** /videos/{video_id}/content | Get video content |
| [**Health**](DefaultApi.md#health) | **GET** /health | Health check |
| [**ListFiles**](DefaultApi.md#listfiles) | **GET** /files | List files |
| [**ListModels**](DefaultApi.md#listmodels) | **GET** /models | List models |
| [**ListProviders**](DefaultApi.md#listproviders) | **GET** /providers | List providers |
| [**ListProvisioningKeys**](DefaultApi.md#listprovisioningkeys) | **GET** /provisioning/keys | List provisioning keys |
| [**RetrieveBatch**](DefaultApi.md#retrievebatch) | **GET** /batches/{batch_id} | Retrieve batch |
| [**RetrieveFile**](DefaultApi.md#retrievefile) | **GET** /files/{file_id} | Retrieve file |
| [**Root**](DefaultApi.md#root) | **GET** / | Root endpoint |
| [**UpdateProvisioningKey**](DefaultApi.md#updateprovisioningkey) | **PATCH** /provisioning/keys/{id} | Update provisioning key |
| [**UploadFile**](DefaultApi.md#uploadfile) | **POST** /files | Upload file |

<a id="createanthropicmessage"></a>
# **CreateAnthropicMessage**
> AnthropicMessagesResponse CreateAnthropicMessage (AnthropicMessagesRequest anthropicMessagesRequest)

Create message

Creates a message using the Anthropic Messages API.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **anthropicMessagesRequest** | [**AnthropicMessagesRequest**](AnthropicMessagesRequest.md) |  |  |

### Return type

[**AnthropicMessagesResponse**](AnthropicMessagesResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json, text/event-stream


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Message response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createbatch"></a>
# **CreateBatch**
> BatchResponse CreateBatch (BatchRequest batchRequest)

Create batch

Creates a batch of API requests.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **batchRequest** | [**BatchRequest**](BatchRequest.md) |  |  |

### Return type

[**BatchResponse**](BatchResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Batch response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createchatcompletion"></a>
# **CreateChatCompletion**
> ChatCompletionsResponse CreateChatCompletion (ChatCompletionsRequest chatCompletionsRequest)

Create chat completion

Creates a completion for the chat message.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **chatCompletionsRequest** | [**ChatCompletionsRequest**](ChatCompletionsRequest.md) |  |  |

### Return type

[**ChatCompletionsResponse**](ChatCompletionsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json, text/event-stream


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Chat completion response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createembedding"></a>
# **CreateEmbedding**
> EmbeddingsResponse CreateEmbedding (EmbeddingsRequest embeddingsRequest)

Create embeddings

Creates an embedding vector representing the input text.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **embeddingsRequest** | [**EmbeddingsRequest**](EmbeddingsRequest.md) |  |  |

### Return type

[**EmbeddingsResponse**](EmbeddingsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Embeddings response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createimage"></a>
# **CreateImage**
> ImagesGenerationResponse CreateImage (ImagesGenerationRequest imagesGenerationRequest)

Create image

Creates an image given a prompt.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **imagesGenerationRequest** | [**ImagesGenerationRequest**](ImagesGenerationRequest.md) |  |  |

### Return type

[**ImagesGenerationResponse**](ImagesGenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Image response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createimageedit"></a>
# **CreateImageEdit**
> ImagesEditResponse CreateImageEdit (string model, string image, string prompt, string mask = null, string size = null, int n = null, string user = null, bool meta = null, bool usage = null, DebugOptions debug = null, ProviderRoutingOptions provider = null)

Create image edit

Creates an edited or extended image given an original image and a prompt.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **model** | **string** |  |  |
| **image** | **string** |  |  |
| **prompt** | **string** |  |  |
| **mask** | **string** |  | [optional]  |
| **size** | **string** |  | [optional]  |
| **n** | **int** |  | [optional]  |
| **user** | **string** |  | [optional]  |
| **meta** | **bool** |  | [optional]  |
| **usage** | **bool** |  | [optional]  |
| **debug** | [**DebugOptions**](DebugOptions.md) |  | [optional]  |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional]  |

### Return type

[**ImagesEditResponse**](ImagesEditResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Image edit response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createmoderation"></a>
# **CreateModeration**
> ModerationsResponse CreateModeration (ModerationsRequest moderationsRequest)

Create moderation

Classifies if text violates OpenAI's usage policies.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **moderationsRequest** | [**ModerationsRequest**](ModerationsRequest.md) |  |  |

### Return type

[**ModerationsResponse**](ModerationsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Moderation response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createocr"></a>
# **CreateOcr**
> Dictionary&lt;string, Object&gt; CreateOcr (OcrRequest ocrRequest)

Create OCR

Extracts text from an image using the requested model.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **ocrRequest** | [**OcrRequest**](OcrRequest.md) |  |  |

### Return type

**Dictionary<string, Object>**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OCR response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createprovisioningkey"></a>
# **CreateProvisioningKey**
> CreateProvisioningKey201Response CreateProvisioningKey (CreateProvisioningKeyRequest createProvisioningKeyRequest)

Create provisioning key

Creates a new provisioning key for a team.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **createProvisioningKeyRequest** | [**CreateProvisioningKeyRequest**](CreateProvisioningKeyRequest.md) |  |  |

### Return type

[**CreateProvisioningKey201Response**](CreateProvisioningKey201Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Created provisioning key |  -  |
| **400** | Bad request |  -  |
| **500** | Server error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createresponse"></a>
# **CreateResponse**
> ResponsesResponse CreateResponse (ResponsesRequest responsesRequest)

Create response

Creates a response using the Responses API.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **responsesRequest** | [**ResponsesRequest**](ResponsesRequest.md) |  |  |

### Return type

[**ResponsesResponse**](ResponsesResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json, text/event-stream


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createspeech"></a>
# **CreateSpeech**
> System.IO.Stream CreateSpeech (AudioSpeechRequest audioSpeechRequest)

Generate speech

Generates audio from the input text.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **audioSpeechRequest** | [**AudioSpeechRequest**](AudioSpeechRequest.md) |  |  |

### Return type

**System.IO.Stream**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: audio/mpeg


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Audio file |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createtranscription"></a>
# **CreateTranscription**
> AudioTranscriptionResponse CreateTranscription (string model, string audioUrl = null, string audioB64 = null, string language = null, DebugOptions debug = null, ProviderRoutingOptions provider = null)

Create transcription

Transcribes audio into the input language.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **model** | **string** |  |  |
| **audioUrl** | **string** |  | [optional]  |
| **audioB64** | **string** |  | [optional]  |
| **language** | **string** |  | [optional]  |
| **debug** | [**DebugOptions**](DebugOptions.md) |  | [optional]  |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional]  |

### Return type

[**AudioTranscriptionResponse**](AudioTranscriptionResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Transcription response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createtranslation"></a>
# **CreateTranslation**
> AudioTranslationResponse CreateTranslation (string model, string audioUrl = null, string audioB64 = null, string language = null, string prompt = null, decimal temperature = null, DebugOptions debug = null, ProviderRoutingOptions provider = null)

Create translation

Translates audio into English.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **model** | **string** |  |  |
| **audioUrl** | **string** |  | [optional]  |
| **audioB64** | **string** |  | [optional]  |
| **language** | **string** |  | [optional]  |
| **prompt** | **string** |  | [optional]  |
| **temperature** | **decimal** |  | [optional]  |
| **debug** | [**DebugOptions**](DebugOptions.md) |  | [optional]  |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional]  |

### Return type

[**AudioTranslationResponse**](AudioTranslationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Translation response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createvideo"></a>
# **CreateVideo**
> VideoGenerationResponse CreateVideo (VideoGenerationRequest videoGenerationRequest)

Create video

Creates a video from a prompt.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **videoGenerationRequest** | [**VideoGenerationRequest**](VideoGenerationRequest.md) |  |  |

### Return type

[**VideoGenerationResponse**](VideoGenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Video response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="deleteprovisioningkey"></a>
# **DeleteProvisioningKey**
> DeleteProvisioningKey200Response DeleteProvisioningKey (string id)

Delete provisioning key

Permanently deletes a provisioning key.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **id** | **string** | The provisioning key ID |  |

### Return type

[**DeleteProvisioningKey200Response**](DeleteProvisioningKey200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Key deleted successfully |  -  |
| **404** | Key not found |  -  |
| **500** | Server error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="deletevideo"></a>
# **DeleteVideo**
> VideoDeleteResponse DeleteVideo (string videoId)

Delete video

Deletes a video generation request.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **videoId** | **string** | The ID of the video generation request. |  |

### Return type

[**VideoDeleteResponse**](VideoDeleteResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Video deletion response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="generatemusic"></a>
# **GenerateMusic**
> Dictionary&lt;string, Object&gt; GenerateMusic (MusicGenerateRequest musicGenerateRequest)

Generate music

Generates music using the requested model and provider settings.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **musicGenerateRequest** | [**MusicGenerateRequest**](MusicGenerateRequest.md) |  |  |

### Return type

**Dictionary<string, Object>**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Music generation response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getactivity"></a>
# **GetActivity**
> GetActivity200Response GetActivity (string teamId, int days = null, int limit = null, int offset = null)

Get activity

Returns recent API activity for a team.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **teamId** | **string** | The team ID to query |  |
| **days** | **int** | Number of days to look back | [optional] [default to 30] |
| **limit** | **int** | Maximum number of records to return | [optional] [default to 50] |
| **offset** | **int** | Pagination offset | [optional] [default to 0] |

### Return type

[**GetActivity200Response**](GetActivity200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Activity data |  -  |
| **400** | Bad request |  -  |
| **500** | Server error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getanalytics"></a>
# **GetAnalytics**
> GetAnalytics200Response GetAnalytics (GetAnalyticsRequest getAnalyticsRequest)

Get analytics

Returns aggregated analytics data.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **getAnalyticsRequest** | [**GetAnalyticsRequest**](GetAnalyticsRequest.md) |  |  |

### Return type

[**GetAnalytics200Response**](GetAnalytics200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Analytics data |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getcredits"></a>
# **GetCredits**
> GetCredits200Response GetCredits (string teamId)

Get remaining credits

Returns the remaining credits and usage statistics for a team.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **teamId** | **string** | The team ID to query |  |

### Return type

[**GetCredits200Response**](GetCredits200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Credit information |  -  |
| **400** | Bad request |  -  |
| **500** | Server error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getgeneration"></a>
# **GetGeneration**
> GenerationResponse GetGeneration (string id)

Get generation

Retrieve a specific generation by ID.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **id** | **string** | The ID of the generation |  |

### Return type

[**GenerationResponse**](GenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Generation data |  -  |
| **401** | Unauthorized |  -  |
| **404** | Not found |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getprovisioningkey"></a>
# **GetProvisioningKey**
> GetProvisioningKey200Response GetProvisioningKey (string id)

Get provisioning key

Returns details of a specific provisioning key.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **id** | **string** | The provisioning key ID |  |

### Return type

[**GetProvisioningKey200Response**](GetProvisioningKey200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Provisioning key details |  -  |
| **404** | Key not found |  -  |
| **500** | Server error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getvideo"></a>
# **GetVideo**
> VideoGenerationResponse GetVideo (string videoId)

Get video status

Retrieves the status for a video generation request.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **videoId** | **string** | The ID of the video generation request. |  |

### Return type

[**VideoGenerationResponse**](VideoGenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Video status response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getvideocontent"></a>
# **GetVideoContent**
> System.IO.Stream GetVideoContent (string videoId)

Get video content

Downloads the rendered video content.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **videoId** | **string** | The ID of the video generation request. |  |

### Return type

**System.IO.Stream**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/octet-stream


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Video content |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="health"></a>
# **Health**
> Health200Response Health ()

Health check

Returns the health status of the API.


### Parameters
This endpoint does not need any parameter.
### Return type

[**Health200Response**](Health200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OK |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="listfiles"></a>
# **ListFiles**
> ListFilesResponse ListFiles ()

List files

Returns a list of files that belong to the user's organization.


### Parameters
This endpoint does not need any parameter.
### Return type

[**ListFilesResponse**](ListFilesResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of files |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="listmodels"></a>
# **ListModels**
> ListModels200Response ListModels (List<string> endpoints = null, ListModelsOrganisationParameter organisation = null, List<string> inputTypes = null, List<string> outputTypes = null, List<string> varParams = null, int limit = null, int offset = null)

List models

Returns a list of available models.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **endpoints** | [**List&lt;string&gt;**](string.md) | Filter by endpoints | [optional]  |
| **organisation** | [**ListModelsOrganisationParameter**](ListModelsOrganisationParameter.md) | Filter by organisation | [optional]  |
| **inputTypes** | [**List&lt;string&gt;**](string.md) | Filter by input types | [optional]  |
| **outputTypes** | [**List&lt;string&gt;**](string.md) | Filter by output types | [optional]  |
| **varParams** | [**List&lt;string&gt;**](string.md) | Filter by params | [optional]  |
| **limit** | **int** | Limit the number of results | [optional] [default to 50] |
| **offset** | **int** | Offset for pagination | [optional] [default to 0] |

### Return type

[**ListModels200Response**](ListModels200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of models |  -  |
| **500** | Error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="listproviders"></a>
# **ListProviders**
> ListProviders200Response ListProviders (int limit = null, int offset = null)

List providers

Returns a list of available API providers.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **limit** | **int** | Limit the number of results | [optional] [default to 50] |
| **offset** | **int** | Offset for pagination | [optional] [default to 0] |

### Return type

[**ListProviders200Response**](ListProviders200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of providers |  -  |
| **500** | Error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="listprovisioningkeys"></a>
# **ListProvisioningKeys**
> ListProvisioningKeys200Response ListProvisioningKeys (string teamId, int limit = null, int offset = null)

List provisioning keys

Returns all provisioning keys for a team.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **teamId** | **string** | The team ID to query |  |
| **limit** | **int** | Maximum number of keys to return | [optional] [default to 50] |
| **offset** | **int** | Pagination offset | [optional] [default to 0] |

### Return type

[**ListProvisioningKeys200Response**](ListProvisioningKeys200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of provisioning keys |  -  |
| **400** | Bad request |  -  |
| **500** | Server error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="retrievebatch"></a>
# **RetrieveBatch**
> BatchResponse RetrieveBatch (string batchId)

Retrieve batch

Retrieves a batch.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **batchId** | **string** | The ID of the batch to retrieve. |  |

### Return type

[**BatchResponse**](BatchResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Batch information |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="retrievefile"></a>
# **RetrieveFile**
> FileResponse RetrieveFile (string fileId)

Retrieve file

Returns information about a specific file.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **fileId** | **string** | The ID of the file to retrieve. |  |

### Return type

[**FileResponse**](FileResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | File information |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="root"></a>
# **Root**
> Root200Response Root ()

Root endpoint

Returns a welcome message.


### Parameters
This endpoint does not need any parameter.
### Return type

[**Root200Response**](Root200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Welcome message |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="updateprovisioningkey"></a>
# **UpdateProvisioningKey**
> UpdateProvisioningKey200Response UpdateProvisioningKey (string id, UpdateProvisioningKeyRequest updateProvisioningKeyRequest)

Update provisioning key

Updates the name, status, or blocked state of a provisioning key.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **id** | **string** | The provisioning key ID |  |
| **updateProvisioningKeyRequest** | [**UpdateProvisioningKeyRequest**](UpdateProvisioningKeyRequest.md) |  |  |

### Return type

[**UpdateProvisioningKey200Response**](UpdateProvisioningKey200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Key updated successfully |  -  |
| **400** | Bad request |  -  |
| **404** | Key not found |  -  |
| **500** | Server error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="uploadfile"></a>
# **UploadFile**
> FileResponse UploadFile (System.IO.Stream file, string purpose)

Upload file

Upload a file that can be used across various endpoints.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **file** | **System.IO.Stream****System.IO.Stream** |  |  |
| **purpose** | **string** |  |  |

### Return type

[**FileResponse**](FileResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | File upload response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

