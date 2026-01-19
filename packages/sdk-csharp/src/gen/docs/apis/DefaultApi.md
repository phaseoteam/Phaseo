# AIStatsSdk.Api.DefaultApi

All URIs are relative to *https://api.phaseo.app/v1*

| Method                                                         | HTTP request                   | Description            |
| -------------------------------------------------------------- | ------------------------------ | ---------------------- |
| [**CreateBatch**](DefaultApi.md#createbatch)                   | **POST** /batches              | Create batch           |
| [**CreateChatCompletion**](DefaultApi.md#createchatcompletion) | **POST** /chat/completions     | Create chat completion |
| [**CreateEmbedding**](DefaultApi.md#createembedding)           | **POST** /embeddings           | Create embeddings      |
| [**CreateImage**](DefaultApi.md#createimage)                   | **POST** /images/generations   | Create image           |
| [**CreateImageEdit**](DefaultApi.md#createimageedit)           | **POST** /images/edits         | Create image edit      |
| [**CreateModeration**](DefaultApi.md#createmoderation)         | **POST** /moderations          | Create moderation      |
| [**CreateResponse**](DefaultApi.md#createresponse)             | **POST** /responses            | Create response        |
| [**CreateSpeech**](DefaultApi.md#createspeech)                 | **POST** /audio/speech         | Generate speech        |
| [**CreateTranscription**](DefaultApi.md#createtranscription)   | **POST** /audio/transcriptions | Create transcription   |
| [**CreateTranslation**](DefaultApi.md#createtranslation)       | **POST** /audio/translations   | Create translation     |
| [**CreateVideo**](DefaultApi.md#createvideo)                   | **POST** /videos               | Create video           |
| [**GetAnalytics**](DefaultApi.md#getanalytics)                 | **POST** /analytics            | Get analytics          |
| [**GetGeneration**](DefaultApi.md#getgeneration)               | **GET** /generation            | Get generation         |
| [**Healthz**](DefaultApi.md#healthz)                           | **GET** /healthz               | Health check           |
| [**ListFiles**](DefaultApi.md#listfiles)                       | **GET** /files                 | List files             |
| [**ListModels**](DefaultApi.md#listmodels)                     | **GET** /models                | List models            |
| [**RetrieveBatch**](DefaultApi.md#retrievebatch)               | **GET** /batches/{batch_id}    | Retrieve batch         |
| [**RetrieveFile**](DefaultApi.md#retrievefile)                 | **GET** /files/{file_id}       | Retrieve file          |
| [**Root**](DefaultApi.md#root)                                 | **GET** /                      | Root endpoint          |
| [**UploadFile**](DefaultApi.md#uploadfile)                     | **POST** /files                | Upload file            |

<a id="createbatch"></a>

# **CreateBatch**

> BatchResponse CreateBatch (BatchRequest batchRequest)

Create batch

Creates a batch of API requests.

### Parameters

| Name             | Type                                | Description | Notes |
| ---------------- | ----------------------------------- | ----------- | ----- |
| **batchRequest** | [**BatchRequest**](BatchRequest.md) |             |       |

### Return type

[**BatchResponse**](BatchResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

### HTTP response details

| Status code | Description    | Response headers |
| ----------- | -------------- | ---------------- |
| **200**     | Batch response | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createchatcompletion"></a>

# **CreateChatCompletion**

> ChatCompletionsResponse CreateChatCompletion (ChatCompletionsRequest chatCompletionsRequest)

Create chat completion

Creates a completion for the chat message.

### Parameters

| Name                       | Type                                                    | Description | Notes |
| -------------------------- | ------------------------------------------------------- | ----------- | ----- |
| **chatCompletionsRequest** | [**ChatCompletionsRequest**](ChatCompletionsRequest.md) |             |       |

### Return type

[**ChatCompletionsResponse**](ChatCompletionsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

### HTTP response details

| Status code | Description              | Response headers |
| ----------- | ------------------------ | ---------------- |
| **200**     | Chat completion response | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createembedding"></a>

# **CreateEmbedding**

> EmbeddingsResponse CreateEmbedding (EmbeddingsRequest embeddingsRequest)

Create embeddings

Creates an embedding vector representing the input text.

### Parameters

| Name                  | Type                                          | Description | Notes |
| --------------------- | --------------------------------------------- | ----------- | ----- |
| **embeddingsRequest** | [**EmbeddingsRequest**](EmbeddingsRequest.md) |             |       |

### Return type

[**EmbeddingsResponse**](EmbeddingsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

### HTTP response details

| Status code | Description         | Response headers |
| ----------- | ------------------- | ---------------- |
| **200**     | Embeddings response | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createimage"></a>

# **CreateImage**

> ImagesGenerationResponse CreateImage (ImagesGenerationRequest imagesGenerationRequest)

Create image

Creates an image given a prompt.

### Parameters

| Name                        | Type                                                      | Description | Notes |
| --------------------------- | --------------------------------------------------------- | ----------- | ----- |
| **imagesGenerationRequest** | [**ImagesGenerationRequest**](ImagesGenerationRequest.md) |             |       |

### Return type

[**ImagesGenerationResponse**](ImagesGenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

### HTTP response details

| Status code | Description    | Response headers |
| ----------- | -------------- | ---------------- |
| **200**     | Image response | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createimageedit"></a>

# **CreateImageEdit**

> ImagesEditResponse CreateImageEdit (string model, string image, string prompt, string mask = null, string size = null, int n = null, string user = null, bool meta = null, bool usage = null)

Create image edit

Creates an edited or extended image given an original image and a prompt.

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

[**ImagesEditResponse**](ImagesEditResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: multipart/form-data
-   **Accept**: application/json

### HTTP response details

| Status code | Description         | Response headers |
| ----------- | ------------------- | ---------------- |
| **200**     | Image edit response | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createmoderation"></a>

# **CreateModeration**

> ModerationsResponse CreateModeration (ModerationsRequest moderationsRequest)

Create moderation

Classifies if text violates OpenAI's usage policies.

### Parameters

| Name                   | Type                                            | Description | Notes |
| ---------------------- | ----------------------------------------------- | ----------- | ----- |
| **moderationsRequest** | [**ModerationsRequest**](ModerationsRequest.md) |             |       |

### Return type

[**ModerationsResponse**](ModerationsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

### HTTP response details

| Status code | Description         | Response headers |
| ----------- | ------------------- | ---------------- |
| **200**     | Moderation response | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createresponse"></a>

# **CreateResponse**

> ResponsesResponse CreateResponse (ResponsesRequest responsesRequest)

Create response

Creates a response using the Responses API.

### Parameters

| Name                 | Type                                        | Description | Notes |
| -------------------- | ------------------------------------------- | ----------- | ----- |
| **responsesRequest** | [**ResponsesRequest**](ResponsesRequest.md) |             |       |

### Return type

[**ResponsesResponse**](ResponsesResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
| ----------- | ----------- | ---------------- |
| **200**     | Response    | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createspeech"></a>

# **CreateSpeech**

> System.IO.Stream CreateSpeech (AudioSpeechRequest audioSpeechRequest)

Generate speech

Generates audio from the input text.

### Parameters

| Name                   | Type                                            | Description | Notes |
| ---------------------- | ----------------------------------------------- | ----------- | ----- |
| **audioSpeechRequest** | [**AudioSpeechRequest**](AudioSpeechRequest.md) |             |       |

### Return type

**System.IO.Stream**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: audio/mpeg

### HTTP response details

| Status code | Description | Response headers |
| ----------- | ----------- | ---------------- |
| **200**     | Audio file  | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createtranscription"></a>

# **CreateTranscription**

> AudioTranscriptionResponse CreateTranscription (string model, string audioUrl = null, string audioB64 = null, string language = null)

Create transcription

Transcribes audio into the input language.

### Parameters

| Name         | Type       | Description | Notes      |
| ------------ | ---------- | ----------- | ---------- |
| **model**    | **string** |             |            |
| **audioUrl** | **string** |             | [optional] |
| **audioB64** | **string** |             | [optional] |
| **language** | **string** |             | [optional] |

### Return type

[**AudioTranscriptionResponse**](AudioTranscriptionResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: multipart/form-data
-   **Accept**: application/json

### HTTP response details

| Status code | Description            | Response headers |
| ----------- | ---------------------- | ---------------- |
| **200**     | Transcription response | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createtranslation"></a>

# **CreateTranslation**

> AudioTranslationResponse CreateTranslation (string model, string audioUrl = null, string audioB64 = null, string language = null, string prompt = null, decimal temperature = null)

Create translation

Translates audio into English.

### Parameters

| Name            | Type        | Description | Notes      |
| --------------- | ----------- | ----------- | ---------- |
| **model**       | **string**  |             |            |
| **audioUrl**    | **string**  |             | [optional] |
| **audioB64**    | **string**  |             | [optional] |
| **language**    | **string**  |             | [optional] |
| **prompt**      | **string**  |             | [optional] |
| **temperature** | **decimal** |             | [optional] |

### Return type

[**AudioTranslationResponse**](AudioTranslationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: multipart/form-data
-   **Accept**: application/json

### HTTP response details

| Status code | Description          | Response headers |
| ----------- | -------------------- | ---------------- |
| **200**     | Translation response | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="createvideo"></a>

# **CreateVideo**

> VideoGenerationResponse CreateVideo (VideoGenerationRequest videoGenerationRequest)

Create video

Creates a video from a prompt.

### Parameters

| Name                       | Type                                                    | Description | Notes |
| -------------------------- | ------------------------------------------------------- | ----------- | ----- |
| **videoGenerationRequest** | [**VideoGenerationRequest**](VideoGenerationRequest.md) |             |       |

### Return type

[**VideoGenerationResponse**](VideoGenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

### HTTP response details

| Status code | Description    | Response headers |
| ----------- | -------------- | ---------------- |
| **200**     | Video response | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getanalytics"></a>

# **GetAnalytics**

> GetAnalytics200Response GetAnalytics (GetAnalyticsRequest getAnalyticsRequest)

Get analytics

Returns aggregated analytics data.

### Parameters

| Name                    | Type                                              | Description | Notes |
| ----------------------- | ------------------------------------------------- | ----------- | ----- |
| **getAnalyticsRequest** | [**GetAnalyticsRequest**](GetAnalyticsRequest.md) |             |       |

### Return type

[**GetAnalytics200Response**](GetAnalytics200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

### HTTP response details

| Status code | Description    | Response headers |
| ----------- | -------------- | ---------------- |
| **200**     | Analytics data | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="getgeneration"></a>

# **GetGeneration**

> GenerationResponse GetGeneration (string id)

Get generation

Retrieve a specific generation by ID.

### Parameters

| Name   | Type       | Description              | Notes |
| ------ | ---------- | ------------------------ | ----- |
| **id** | **string** | The ID of the generation |       |

### Return type

[**GenerationResponse**](GenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: application/json

### HTTP response details

| Status code | Description     | Response headers |
| ----------- | --------------- | ---------------- |
| **200**     | Generation data | -                |
| **401**     | Unauthorized    | -                |
| **404**     | Not found       | -                |

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

-   **Content-Type**: Not defined
-   **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
| ----------- | ----------- | ---------------- |
| **200**     | OK          | -                |

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

-   **Content-Type**: Not defined
-   **Accept**: application/json

### HTTP response details

| Status code | Description   | Response headers |
| ----------- | ------------- | ---------------- |
| **200**     | List of files | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="listmodels"></a>

# **ListModels**

> ListModels200Response ListModels (List<string> endpoints = null, ListModelsOrganisationParameter organisation = null, List<string> inputTypes = null, List<string> outputTypes = null, List<string> varParams = null, int limit = null, int offset = null)

List models

Returns a list of available models.

### Parameters

| Name             | Type                                                                      | Description                 | Notes                      |
| ---------------- | ------------------------------------------------------------------------- | --------------------------- | -------------------------- |
| **endpoints**    | [**List&lt;string&gt;**](string.md)                                       | Filter by endpoints         | [optional]                 |
| **organisation** | [**ListModelsOrganisationParameter**](ListModelsOrganisationParameter.md) | Filter by organisation      | [optional]                 |
| **inputTypes**   | [**List&lt;string&gt;**](string.md)                                       | Filter by input types       | [optional]                 |
| **outputTypes**  | [**List&lt;string&gt;**](string.md)                                       | Filter by output types      | [optional]                 |
| **varParams**    | [**List&lt;string&gt;**](string.md)                                       | Filter by params            | [optional]                 |
| **limit**        | **int**                                                                   | Limit the number of results | [optional] [default to 50] |
| **offset**       | **int**                                                                   | Offset for pagination       | [optional] [default to 0]  |

### Return type

[**ListModels200Response**](ListModels200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: application/json

### HTTP response details

| Status code | Description    | Response headers |
| ----------- | -------------- | ---------------- |
| **200**     | List of models | -                |
| **500**     | Error          | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="retrievebatch"></a>

# **RetrieveBatch**

> BatchResponse RetrieveBatch (string batchId)

Retrieve batch

Retrieves a batch.

### Parameters

| Name        | Type       | Description                      | Notes |
| ----------- | ---------- | -------------------------------- | ----- |
| **batchId** | **string** | The ID of the batch to retrieve. |       |

### Return type

[**BatchResponse**](BatchResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: application/json

### HTTP response details

| Status code | Description       | Response headers |
| ----------- | ----------------- | ---------------- |
| **200**     | Batch information | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="retrievefile"></a>

# **RetrieveFile**

> FileResponse RetrieveFile (string fileId)

Retrieve file

Returns information about a specific file.

### Parameters

| Name       | Type       | Description                     | Notes |
| ---------- | ---------- | ------------------------------- | ----- |
| **fileId** | **string** | The ID of the file to retrieve. |       |

### Return type

[**FileResponse**](FileResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | File information | -                |

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

-   **Content-Type**: Not defined
-   **Accept**: application/json

### HTTP response details

| Status code | Description     | Response headers |
| ----------- | --------------- | ---------------- |
| **200**     | Welcome message | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)

<a id="uploadfile"></a>

# **UploadFile**

> FileResponse UploadFile (System.IO.Stream file, string purpose)

Upload file

Upload a file that can be used across various endpoints.

### Parameters

| Name        | Type                                         | Description | Notes |
| ----------- | -------------------------------------------- | ----------- | ----- |
| **file**    | **System.IO.Stream\*\***System.IO.Stream\*\* |             |       |
| **purpose** | **string**                                   |             |       |

### Return type

[**FileResponse**](FileResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: multipart/form-data
-   **Accept**: application/json

### HTTP response details

| Status code | Description          | Response headers |
| ----------- | -------------------- | ---------------- |
| **200**     | File upload response | -                |

[[Back to top]](#) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to Model list]](../../README.md#documentation-for-models) [[Back to README]](../../README.md)
