# AIStatsSdk.Api.DefaultApi

All URIs are relative to *https://api.phaseo.app/v1*

| Method | HTTP request | Description |
|--------|--------------|-------------|
| [**CalculatePricing**](DefaultApi.md#calculatepricing) | **POST** /pricing/calculate | Calculate pricing |
| [**CreateAnthropicMessage**](DefaultApi.md#createanthropicmessage) | **POST** /messages | Create message |
| [**CreateBatch**](DefaultApi.md#createbatch) | **POST** /batches | Create batch |
| [**CreateBatchAlias**](DefaultApi.md#createbatchalias) | **POST** /batch | Create batch (alias) |
| [**CreateChatCompletion**](DefaultApi.md#createchatcompletion) | **POST** /chat/completions | Create chat completion |
| [**CreateEmbedding**](DefaultApi.md#createembedding) | **POST** /embeddings | Create embeddings |
| [**CreateImage**](DefaultApi.md#createimage) | **POST** /images/generations | Create image |
| [**CreateImageEdit**](DefaultApi.md#createimageedit) | **POST** /images/edits | Create image edit |
| [**CreateKeyPlaceholder**](DefaultApi.md#createkeyplaceholder) | **POST** /keys | Create key (placeholder) |
| [**CreateModeration**](DefaultApi.md#createmoderation) | **POST** /moderations | Create moderation |
| [**CreateOAuthClient**](DefaultApi.md#createoauthclient) | **POST** /oauth-clients | Create OAuth client |
| [**CreateOcr**](DefaultApi.md#createocr) | **POST** /ocr | Create OCR |
| [**CreateResponse**](DefaultApi.md#createresponse) | **POST** /responses | Create response |
| [**CreateSpeech**](DefaultApi.md#createspeech) | **POST** /audio/speech | Generate speech |
| [**CreateTranscription**](DefaultApi.md#createtranscription) | **POST** /audio/transcriptions | Create transcription |
| [**CreateTranslation**](DefaultApi.md#createtranslation) | **POST** /audio/translations | Create translation |
| [**CreateVideo**](DefaultApi.md#createvideo) | **POST** /videos | Create video |
| [**CreateVideoAlias**](DefaultApi.md#createvideoalias) | **POST** /video/generations | Create video (alias) |
| [**DeleteOAuthClient**](DefaultApi.md#deleteoauthclient) | **DELETE** /oauth-clients/{client_id} | Delete OAuth client |
| [**DeleteProvisioningKey**](DefaultApi.md#deleteprovisioningkey) | **DELETE** /management/keys/{id} | Delete management API key |
| [**DeleteProvisioningKeyAlias**](DefaultApi.md#deleteprovisioningkeyalias) | **DELETE** /provisioning/keys/{id} | Delete provisioning key |
| [**DeleteVideo**](DefaultApi.md#deletevideo) | **DELETE** /videos/{video_id} | Delete video |
| [**DeleteVideoAlias**](DefaultApi.md#deletevideoalias) | **DELETE** /video/generations/{video_id} | Delete video (alias) |
| [**GenerateMusic**](DefaultApi.md#generatemusic) | **POST** /music/generate | Generate music |
| [**GenerateMusicAlias**](DefaultApi.md#generatemusicalias) | **POST** /music/generations | Generate music (alias) |
| [**GetActivity**](DefaultApi.md#getactivity) | **GET** /activity | Get activity |
| [**GetAnalytics**](DefaultApi.md#getanalytics) | **POST** /analytics | Get analytics |
| [**GetCredits**](DefaultApi.md#getcredits) | **GET** /credits | Get remaining credits |
| [**GetGeneration**](DefaultApi.md#getgeneration) | **GET** /generations | Get generation |
| [**GetKeyPlaceholder**](DefaultApi.md#getkeyplaceholder) | **GET** /key | Get key (placeholder) |
| [**GetMusicGeneration**](DefaultApi.md#getmusicgeneration) | **GET** /music/generate/{music_id} | Get music generation status |
| [**GetMusicGenerationAlias**](DefaultApi.md#getmusicgenerationalias) | **GET** /music/generations/{music_id} | Get music generation status (alias) |
| [**GetOAuthClient**](DefaultApi.md#getoauthclient) | **GET** /oauth-clients/{client_id} | Get OAuth client |
| [**GetProviderDerankStatus**](DefaultApi.md#getproviderderankstatus) | **GET** /health/providers/{provider_id}/derank | Provider derank status |
| [**GetProvisioningKey**](DefaultApi.md#getprovisioningkey) | **GET** /management/keys/{id} | Get management API key |
| [**GetProvisioningKeyAlias**](DefaultApi.md#getprovisioningkeyalias) | **GET** /provisioning/keys/{id} | Get provisioning key |
| [**GetVideo**](DefaultApi.md#getvideo) | **GET** /videos/{video_id} | Get video status |
| [**GetVideoAlias**](DefaultApi.md#getvideoalias) | **GET** /video/generations/{video_id} | Get video status (alias) |
| [**GetVideoContent**](DefaultApi.md#getvideocontent) | **GET** /videos/{video_id}/content | Get video content |
| [**GetVideoContentAlias**](DefaultApi.md#getvideocontentalias) | **GET** /video/generations/{video_id}/content | Get video content (alias) |
| [**Healthz**](DefaultApi.md#healthz) | **GET** /health | Health check |
| [**InvalidateGatewayKeyCache**](DefaultApi.md#invalidategatewaykeycache) | **POST** /keys/{id}/invalidate | Invalidate key cache |
| [**ListEndpointsPlaceholder**](DefaultApi.md#listendpointsplaceholder) | **GET** /endpoints | List endpoints (placeholder) |
| [**ListFiles**](DefaultApi.md#listfiles) | **GET** /files | List files |
| [**ListKeysPlaceholder**](DefaultApi.md#listkeysplaceholder) | **GET** /keys | List keys (placeholder) |
| [**ListModels**](DefaultApi.md#listmodels) | **GET** /models | List models |
| [**ListOAuthClients**](DefaultApi.md#listoauthclients) | **GET** /oauth-clients | List OAuth clients |
| [**ListOrganisations**](DefaultApi.md#listorganisations) | **GET** /organisations | List organisations |
| [**ListPricingModels**](DefaultApi.md#listpricingmodels) | **GET** /pricing/models | List pricing models |
| [**ListProviders**](DefaultApi.md#listproviders) | **GET** /providers | List providers |
| [**ListProvisioningKeys**](DefaultApi.md#listprovisioningkeys) | **GET** /management/keys | List management API keys |
| [**ListProvisioningKeysAlias**](DefaultApi.md#listprovisioningkeysalias) | **GET** /provisioning/keys | List provisioning keys |
| [**RegenerateOAuthClientSecret**](DefaultApi.md#regenerateoauthclientsecret) | **POST** /oauth-clients/{client_id}/regenerate-secret | Regenerate OAuth client secret |
| [**RetrieveBatch**](DefaultApi.md#retrievebatch) | **GET** /batches/{batch_id} | Retrieve batch |
| [**RetrieveBatchAlias**](DefaultApi.md#retrievebatchalias) | **GET** /batch/{id} | Retrieve batch (alias) |
| [**RetrieveFile**](DefaultApi.md#retrievefile) | **GET** /files/{file_id} | Retrieve file |
| [**Root**](DefaultApi.md#root) | **GET** / | Root endpoint |
| [**UpdateOAuthClient**](DefaultApi.md#updateoauthclient) | **PATCH** /oauth-clients/{client_id} | Update OAuth client |
| [**UpdateProvisioningKey**](DefaultApi.md#updateprovisioningkey) | **PATCH** /management/keys/{id} | Update management API key |
| [**UpdateProvisioningKeyAlias**](DefaultApi.md#updateprovisioningkeyalias) | **PATCH** /provisioning/keys/{id} | Update provisioning key |
| [**UploadFile**](DefaultApi.md#uploadfile) | **POST** /files | Upload file |

<a id="calculatepricing"></a>
# **CalculatePricing**
> CalculatePricing200Response CalculatePricing (CalculatePricingRequest calculatePricingRequest)

Calculate pricing

Calculates price for a usage payload.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **calculatePricingRequest** | [**CalculatePricingRequest**](CalculatePricingRequest.md) |  |  |

### Return type

[**CalculatePricing200Response**](CalculatePricing200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Pricing calculation result |  -  |
| **400** | Missing required fields |  -  |
| **404** | Pricing not found |  -  |
| **500** | Calculation error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

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

<a id="createbatchalias"></a>
# **CreateBatchAlias**
> BatchResponse CreateBatchAlias (BatchRequest batchRequest)

Create batch (alias)

Alias of /batches.


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
 - **Accept**: application/json


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
> ImagesEditResponse CreateImageEdit (string model, string image, string prompt, string mask = null, string size = null, int n = null, string user = null, bool meta = null, bool usage = null, ProviderRoutingOptions provider = null)

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

<a id="createkeyplaceholder"></a>
# **CreateKeyPlaceholder**
> void CreateKeyPlaceholder ()

Create key (placeholder)

Placeholder route; currently returns not implemented.


### Parameters
This endpoint does not need any parameter.
### Return type

void (empty response body)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **501** | Not implemented |  -  |

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

<a id="createoauthclient"></a>
# **CreateOAuthClient**
> Dictionary&lt;string, Object&gt; CreateOAuthClient (CreateOAuthClientRequest createOAuthClientRequest)

Create OAuth client

Creates a team-scoped OAuth client.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **createOAuthClientRequest** | [**CreateOAuthClientRequest**](CreateOAuthClientRequest.md) |  |  |

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
| **201** | OAuth client created |  -  |
| **400** | Validation error |  -  |
| **401** | Unauthorized |  -  |

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
 - **Accept**: application/json


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
> AudioTranscriptionResponse CreateTranscription (string model, string audioUrl = null, string audioB64 = null, string language = null, ProviderRoutingOptions provider = null)

Create transcription

Transcribes audio into the input language.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **model** | **string** |  |  |
| **audioUrl** | **string** |  | [optional]  |
| **audioB64** | **string** |  | [optional]  |
| **language** | **string** |  | [optional]  |
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
> AudioTranslationResponse CreateTranslation (string model, string audioUrl = null, string audioB64 = null, string language = null, string prompt = null, decimal temperature = null, ProviderRoutingOptions provider = null)

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

<a id="createvideoalias"></a>
# **CreateVideoAlias**
> VideoGenerationResponse CreateVideoAlias (VideoGenerationRequest videoGenerationRequest)

Create video (alias)

Alias of /videos.


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

<a id="deleteoauthclient"></a>
# **DeleteOAuthClient**
> Dictionary&lt;string, Object&gt; DeleteOAuthClient (string clientId)

Delete OAuth client

Deletes an OAuth client and related metadata.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **clientId** | **string** |  |  |

### Return type

**Dictionary<string, Object>**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OAuth client deleted |  -  |
| **404** | OAuth app not found |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="deleteprovisioningkey"></a>
# **DeleteProvisioningKey**
> DeleteProvisioningKey200Response DeleteProvisioningKey (string id)

Delete management API key

Permanently deletes a management API key.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **id** | **string** | The management API key ID |  |

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

<a id="deleteprovisioningkeyalias"></a>
# **DeleteProvisioningKeyAlias**
> Dictionary&lt;string, Object&gt; DeleteProvisioningKeyAlias (string id)

Delete provisioning key

Alias of management key delete endpoint.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **id** | **string** |  |  |

### Return type

**Dictionary<string, Object>**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Provisioning key deleted |  -  |

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

<a id="deletevideoalias"></a>
# **DeleteVideoAlias**
> VideoDeleteResponse DeleteVideoAlias (string videoId)

Delete video (alias)

Alias of /videos/{video_id}.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **videoId** | **string** |  |  |

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

<a id="generatemusicalias"></a>
# **GenerateMusicAlias**
> Dictionary&lt;string, Object&gt; GenerateMusicAlias (MusicGenerateRequest musicGenerateRequest)

Generate music (alias)

Alias of /music/generate.


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

<a id="getkeyplaceholder"></a>
# **GetKeyPlaceholder**
> void GetKeyPlaceholder ()

Get key (placeholder)

Placeholder route; currently returns not implemented.


### Parameters
This endpoint does not need any parameter.
### Return type

void (empty response body)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **501** | Not implemented |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getmusicgeneration"></a>
# **GetMusicGeneration**
> Dictionary&lt;string, Object&gt; GetMusicGeneration (string musicId)

Get music generation status

Retrieves the status for a music generation request.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **musicId** | **string** | The ID of the music generation request. |  |

### Return type

**Dictionary<string, Object>**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Music generation status response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getmusicgenerationalias"></a>
# **GetMusicGenerationAlias**
> Dictionary&lt;string, Object&gt; GetMusicGenerationAlias (string musicId)

Get music generation status (alias)

Alias of /music/generate/{music_id}.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **musicId** | **string** |  |  |

### Return type

**Dictionary<string, Object>**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Music generation status response |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getoauthclient"></a>
# **GetOAuthClient**
> Dictionary&lt;string, Object&gt; GetOAuthClient (string clientId)

Get OAuth client

Returns details for an OAuth client.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **clientId** | **string** |  |  |

### Return type

**Dictionary<string, Object>**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OAuth client details |  -  |
| **404** | OAuth app not found |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getproviderderankstatus"></a>
# **GetProviderDerankStatus**
> Dictionary&lt;string, Object&gt; GetProviderDerankStatus (string providerId, int windowHours = null, int maxPairs = null, int fetchLimit = null)

Provider derank status

Returns breaker-based derank/recovery status for a provider.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **providerId** | **string** | Provider identifier. |  |
| **windowHours** | **int** | Observation window in hours. | [optional]  |
| **maxPairs** | **int** | Max endpoint/model tuples to inspect. | [optional]  |
| **fetchLimit** | **int** | Max recent requests to scan. | [optional]  |

### Return type

**Dictionary<string, Object>**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Provider derank snapshot |  -  |
| **400** | Invalid provider id |  -  |
| **403** | Invalid control secret |  -  |
| **503** | Control secret not configured |  -  |
| **500** | Error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getprovisioningkey"></a>
# **GetProvisioningKey**
> GetProvisioningKey200Response GetProvisioningKey (string id)

Get management API key

Returns details of a specific management API key.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **id** | **string** | The management API key ID |  |

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
| **200** | Management API key details |  -  |
| **404** | Key not found |  -  |
| **500** | Server error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getprovisioningkeyalias"></a>
# **GetProvisioningKeyAlias**
> Dictionary&lt;string, Object&gt; GetProvisioningKeyAlias (string id)

Get provisioning key

Alias of management key details endpoint.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **id** | **string** |  |  |

### Return type

**Dictionary<string, Object>**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Provisioning key details |  -  |

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

<a id="getvideoalias"></a>
# **GetVideoAlias**
> VideoGenerationResponse GetVideoAlias (string videoId)

Get video status (alias)

Alias of /videos/{video_id}.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **videoId** | **string** |  |  |

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

<a id="getvideocontentalias"></a>
# **GetVideoContentAlias**
> System.IO.Stream GetVideoContentAlias (string videoId)

Get video content (alias)

Alias of /videos/{video_id}/content.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **videoId** | **string** |  |  |

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

<a id="healthz"></a>
# **Healthz**
> Healthz200Response Healthz ()

Health check

Returns the health status of the API.


### Parameters
This endpoint does not need any parameter.
### Return type

[**Healthz200Response**](Healthz200Response.md)

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

<a id="invalidategatewaykeycache"></a>
# **InvalidateGatewayKeyCache**
> Dictionary&lt;string, Object&gt; InvalidateGatewayKeyCache (string id)

Invalidate key cache

Bumps cache version for key id/kid and invalidates key cache entries.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **id** | **string** | Gateway key ID. |  |

### Return type

**Dictionary<string, Object>**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Key cache invalidated |  -  |
| **400** | Invalid key ID |  -  |
| **403** | Invalid control secret |  -  |
| **404** | Key not found |  -  |
| **503** | Control secret not configured |  -  |
| **500** | Error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="listendpointsplaceholder"></a>
# **ListEndpointsPlaceholder**
> void ListEndpointsPlaceholder ()

List endpoints (placeholder)

Placeholder route; currently returns not implemented.


### Parameters
This endpoint does not need any parameter.
### Return type

void (empty response body)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **501** | Not implemented |  -  |

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

<a id="listkeysplaceholder"></a>
# **ListKeysPlaceholder**
> void ListKeysPlaceholder ()

List keys (placeholder)

Placeholder route; currently returns not implemented.


### Parameters
This endpoint does not need any parameter.
### Return type

void (empty response body)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **501** | Not implemented |  -  |

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

<a id="listoauthclients"></a>
# **ListOAuthClients**
> ListOAuthClients200Response ListOAuthClients ()

List OAuth clients

Lists OAuth clients for the authenticated team.


### Parameters
This endpoint does not need any parameter.
### Return type

[**ListOAuthClients200Response**](ListOAuthClients200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OAuth clients list |  -  |
| **401** | Unauthorized |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="listorganisations"></a>
# **ListOrganisations**
> ListOrganisations200Response ListOrganisations (int limit = null, int offset = null)

List organisations

Returns a list of available organisations.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **limit** | **int** | Limit the number of results | [optional] [default to 50] |
| **offset** | **int** | Offset for pagination | [optional] [default to 0] |

### Return type

[**ListOrganisations200Response**](ListOrganisations200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of organisations |  -  |
| **500** | Error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="listpricingmodels"></a>
# **ListPricingModels**
> ListPricingModels200Response ListPricingModels ()

List pricing models

Returns active provider/model pricing entries.


### Parameters
This endpoint does not need any parameter.
### Return type

[**ListPricingModels200Response**](ListPricingModels200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Pricing model list |  -  |
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

List management API keys

Returns all management API keys for a team.


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
| **200** | List of management API keys |  -  |
| **400** | Bad request |  -  |
| **500** | Server error |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="listprovisioningkeysalias"></a>
# **ListProvisioningKeysAlias**
> ListProvisioningKeysAlias200Response ListProvisioningKeysAlias (string teamId, int limit = null, int offset = null)

List provisioning keys

Alias of management keys endpoint.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **teamId** | **string** | The team ID to query |  |
| **limit** | **int** | Maximum number of keys to return | [optional] [default to 50] |
| **offset** | **int** | Pagination offset | [optional] [default to 0] |

### Return type

[**ListProvisioningKeysAlias200Response**](ListProvisioningKeysAlias200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of provisioning keys |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="regenerateoauthclientsecret"></a>
# **RegenerateOAuthClientSecret**
> Dictionary&lt;string, Object&gt; RegenerateOAuthClientSecret (string clientId)

Regenerate OAuth client secret

Regenerates and returns a new OAuth client secret.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **clientId** | **string** |  |  |

### Return type

**Dictionary<string, Object>**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | OAuth client secret regenerated |  -  |
| **404** | OAuth app not found |  -  |

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

<a id="retrievebatchalias"></a>
# **RetrieveBatchAlias**
> BatchResponse RetrieveBatchAlias (string id)

Retrieve batch (alias)

Alias of /batches/{batch_id}.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **id** | **string** |  |  |

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

<a id="updateoauthclient"></a>
# **UpdateOAuthClient**
> Dictionary&lt;string, Object&gt; UpdateOAuthClient (string clientId, Dictionary<string, Object> requestBody)

Update OAuth client

Updates OAuth client metadata and redirect URIs.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **clientId** | **string** |  |  |
| **requestBody** | [**Dictionary&lt;string, Object&gt;**](Object.md) |  |  |

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
| **200** | OAuth client updated |  -  |
| **400** | Validation error |  -  |
| **404** | OAuth app not found |  -  |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="updateprovisioningkey"></a>
# **UpdateProvisioningKey**
> UpdateProvisioningKey200Response UpdateProvisioningKey (string id, UpdateProvisioningKeyRequest updateProvisioningKeyRequest)

Update management API key

Updates the name, status, or blocked state of a management API key.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **id** | **string** | The management API key ID |  |
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

<a id="updateprovisioningkeyalias"></a>
# **UpdateProvisioningKeyAlias**
> Dictionary&lt;string, Object&gt; UpdateProvisioningKeyAlias (string id, Dictionary<string, Object> requestBody)

Update provisioning key

Alias of management key update endpoint.


### Parameters

| Name | Type | Description | Notes |
|------|------|-------------|-------|
| **id** | **string** |  |  |
| **requestBody** | [**Dictionary&lt;string, Object&gt;**](Object.md) |  |  |

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
| **200** | Provisioning key updated |  -  |

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

