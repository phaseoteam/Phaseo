# AIStatsSdk::DefaultApi

All URIs are relative to *https://api.phaseo.app/v1*

| Method                                                             | HTTP request                   | Description            |
| ------------------------------------------------------------------ | ------------------------------ | ---------------------- |
| [**create_batch**](DefaultApi.md#create_batch)                     | **POST** /batches              | Create batch           |
| [**create_chat_completion**](DefaultApi.md#create_chat_completion) | **POST** /chat/completions     | Create chat completion |
| [**create_embedding**](DefaultApi.md#create_embedding)             | **POST** /embeddings           | Create embeddings      |
| [**create_image**](DefaultApi.md#create_image)                     | **POST** /images/generations   | Create image           |
| [**create_image_edit**](DefaultApi.md#create_image_edit)           | **POST** /images/edits         | Create image edit      |
| [**create_moderation**](DefaultApi.md#create_moderation)           | **POST** /moderations          | Create moderation      |
| [**create_response**](DefaultApi.md#create_response)               | **POST** /responses            | Create response        |
| [**create_speech**](DefaultApi.md#create_speech)                   | **POST** /audio/speech         | Generate speech        |
| [**create_transcription**](DefaultApi.md#create_transcription)     | **POST** /audio/transcriptions | Create transcription   |
| [**create_translation**](DefaultApi.md#create_translation)         | **POST** /audio/translations   | Create translation     |
| [**create_video**](DefaultApi.md#create_video)                     | **POST** /videos               | Create video           |
| [**get_analytics**](DefaultApi.md#get_analytics)                   | **POST** /analytics            | Get analytics          |
| [**get_generation**](DefaultApi.md#get_generation)                 | **GET** /generation            | Get generation         |
| [**healthz**](DefaultApi.md#healthz)                               | **GET** /healthz               | Health check           |
| [**list_files**](DefaultApi.md#list_files)                         | **GET** /files                 | List files             |
| [**list_models**](DefaultApi.md#list_models)                       | **GET** /models                | List models            |
| [**retrieve_batch**](DefaultApi.md#retrieve_batch)                 | **GET** /batches/{batch_id}    | Retrieve batch         |
| [**retrieve_file**](DefaultApi.md#retrieve_file)                   | **GET** /files/{file_id}       | Retrieve file          |
| [**root**](DefaultApi.md#root)                                     | **GET** /                      | Root endpoint          |
| [**upload_file**](DefaultApi.md#upload_file)                       | **POST** /files                | Upload file            |

## create_batch

> <BatchResponse> create_batch(batch_request)

Create batch

Creates a batch of API requests.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
batch_request = AIStatsSdk::BatchRequest.new({input_file_id: 'input_file_id_example', endpoint: 'endpoint_example'}) # BatchRequest |

begin
  # Create batch
  result = api_instance.create_batch(batch_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_batch: #{e}"
end
```

#### Using the create_batch_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<BatchResponse>, Integer, Hash)> create_batch_with_http_info(batch_request)

```ruby
begin
  # Create batch
  data, status_code, headers = api_instance.create_batch_with_http_info(batch_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <BatchResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_batch_with_http_info: #{e}"
end
```

### Parameters

| Name              | Type                                | Description | Notes |
| ----------------- | ----------------------------------- | ----------- | ----- |
| **batch_request** | [**BatchRequest**](BatchRequest.md) |             |       |

### Return type

[**BatchResponse**](BatchResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

## create_chat_completion

> <ChatCompletionsResponse> create_chat_completion(chat_completions_request)

Create chat completion

Creates a completion for the chat message.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
chat_completions_request = AIStatsSdk::ChatCompletionsRequest.new({model: 'model_example', messages: [AIStatsSdk::ChatMessage.new({role: 'system'})]}) # ChatCompletionsRequest |

begin
  # Create chat completion
  result = api_instance.create_chat_completion(chat_completions_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_chat_completion: #{e}"
end
```

#### Using the create_chat_completion_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<ChatCompletionsResponse>, Integer, Hash)> create_chat_completion_with_http_info(chat_completions_request)

```ruby
begin
  # Create chat completion
  data, status_code, headers = api_instance.create_chat_completion_with_http_info(chat_completions_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <ChatCompletionsResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_chat_completion_with_http_info: #{e}"
end
```

### Parameters

| Name                         | Type                                                    | Description | Notes |
| ---------------------------- | ------------------------------------------------------- | ----------- | ----- |
| **chat_completions_request** | [**ChatCompletionsRequest**](ChatCompletionsRequest.md) |             |       |

### Return type

[**ChatCompletionsResponse**](ChatCompletionsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

## create_embedding

> <EmbeddingsResponse> create_embedding(embeddings_request)

Create embeddings

Creates an embedding vector representing the input text.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
embeddings_request = AIStatsSdk::EmbeddingsRequest.new({model: 'model_example', input: nil}) # EmbeddingsRequest |

begin
  # Create embeddings
  result = api_instance.create_embedding(embeddings_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_embedding: #{e}"
end
```

#### Using the create_embedding_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<EmbeddingsResponse>, Integer, Hash)> create_embedding_with_http_info(embeddings_request)

```ruby
begin
  # Create embeddings
  data, status_code, headers = api_instance.create_embedding_with_http_info(embeddings_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <EmbeddingsResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_embedding_with_http_info: #{e}"
end
```

### Parameters

| Name                   | Type                                          | Description | Notes |
| ---------------------- | --------------------------------------------- | ----------- | ----- |
| **embeddings_request** | [**EmbeddingsRequest**](EmbeddingsRequest.md) |             |       |

### Return type

[**EmbeddingsResponse**](EmbeddingsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

## create_image

> <ImagesGenerationResponse> create_image(images_generation_request)

Create image

Creates an image given a prompt.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
images_generation_request = AIStatsSdk::ImagesGenerationRequest.new({model: 'model_example', prompt: 'prompt_example'}) # ImagesGenerationRequest |

begin
  # Create image
  result = api_instance.create_image(images_generation_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_image: #{e}"
end
```

#### Using the create_image_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<ImagesGenerationResponse>, Integer, Hash)> create_image_with_http_info(images_generation_request)

```ruby
begin
  # Create image
  data, status_code, headers = api_instance.create_image_with_http_info(images_generation_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <ImagesGenerationResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_image_with_http_info: #{e}"
end
```

### Parameters

| Name                          | Type                                                      | Description | Notes |
| ----------------------------- | --------------------------------------------------------- | ----------- | ----- |
| **images_generation_request** | [**ImagesGenerationRequest**](ImagesGenerationRequest.md) |             |       |

### Return type

[**ImagesGenerationResponse**](ImagesGenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

## create_image_edit

> <ImagesEditResponse> create_image_edit(model, image, prompt, opts)

Create image edit

Creates an edited or extended image given an original image and a prompt.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
model = 'model_example' # String |
image = 'image_example' # String |
prompt = 'prompt_example' # String |
opts = {
  mask: 'mask_example', # String |
  size: 'size_example', # String |
  n: 56, # Integer |
  user: 'user_example', # String |
  meta: true, # Boolean |
  usage: true # Boolean |
}

begin
  # Create image edit
  result = api_instance.create_image_edit(model, image, prompt, opts)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_image_edit: #{e}"
end
```

#### Using the create_image_edit_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<ImagesEditResponse>, Integer, Hash)> create_image_edit_with_http_info(model, image, prompt, opts)

```ruby
begin
  # Create image edit
  data, status_code, headers = api_instance.create_image_edit_with_http_info(model, image, prompt, opts)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <ImagesEditResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_image_edit_with_http_info: #{e}"
end
```

### Parameters

| Name       | Type        | Description | Notes      |
| ---------- | ----------- | ----------- | ---------- |
| **model**  | **String**  |             |            |
| **image**  | **String**  |             |            |
| **prompt** | **String**  |             |            |
| **mask**   | **String**  |             | [optional] |
| **size**   | **String**  |             | [optional] |
| **n**      | **Integer** |             | [optional] |
| **user**   | **String**  |             | [optional] |
| **meta**   | **Boolean** |             | [optional] |
| **usage**  | **Boolean** |             | [optional] |

### Return type

[**ImagesEditResponse**](ImagesEditResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: multipart/form-data
-   **Accept**: application/json

## create_moderation

> <ModerationsResponse> create_moderation(moderations_request)

Create moderation

Classifies if text violates OpenAI's usage policies.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
moderations_request = AIStatsSdk::ModerationsRequest.new({model: 'model_example', input: nil}) # ModerationsRequest |

begin
  # Create moderation
  result = api_instance.create_moderation(moderations_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_moderation: #{e}"
end
```

#### Using the create_moderation_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<ModerationsResponse>, Integer, Hash)> create_moderation_with_http_info(moderations_request)

```ruby
begin
  # Create moderation
  data, status_code, headers = api_instance.create_moderation_with_http_info(moderations_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <ModerationsResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_moderation_with_http_info: #{e}"
end
```

### Parameters

| Name                    | Type                                            | Description | Notes |
| ----------------------- | ----------------------------------------------- | ----------- | ----- |
| **moderations_request** | [**ModerationsRequest**](ModerationsRequest.md) |             |       |

### Return type

[**ModerationsResponse**](ModerationsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

## create_response

> <ResponsesResponse> create_response(responses_request)

Create response

Creates a response using the Responses API.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
responses_request = AIStatsSdk::ResponsesRequest.new({model: 'model_example'}) # ResponsesRequest |

begin
  # Create response
  result = api_instance.create_response(responses_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_response: #{e}"
end
```

#### Using the create_response_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<ResponsesResponse>, Integer, Hash)> create_response_with_http_info(responses_request)

```ruby
begin
  # Create response
  data, status_code, headers = api_instance.create_response_with_http_info(responses_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <ResponsesResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_response_with_http_info: #{e}"
end
```

### Parameters

| Name                  | Type                                        | Description | Notes |
| --------------------- | ------------------------------------------- | ----------- | ----- |
| **responses_request** | [**ResponsesRequest**](ResponsesRequest.md) |             |       |

### Return type

[**ResponsesResponse**](ResponsesResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

## create_speech

> File create_speech(audio_speech_request)

Generate speech

Generates audio from the input text.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
audio_speech_request = AIStatsSdk::AudioSpeechRequest.new({model: 'model_example', input: 'input_example'}) # AudioSpeechRequest |

begin
  # Generate speech
  result = api_instance.create_speech(audio_speech_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_speech: #{e}"
end
```

#### Using the create_speech_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(File, Integer, Hash)> create_speech_with_http_info(audio_speech_request)

```ruby
begin
  # Generate speech
  data, status_code, headers = api_instance.create_speech_with_http_info(audio_speech_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => File
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_speech_with_http_info: #{e}"
end
```

### Parameters

| Name                     | Type                                            | Description | Notes |
| ------------------------ | ----------------------------------------------- | ----------- | ----- |
| **audio_speech_request** | [**AudioSpeechRequest**](AudioSpeechRequest.md) |             |       |

### Return type

**File**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: audio/mpeg

## create_transcription

> <AudioTranscriptionResponse> create_transcription(model, opts)

Create transcription

Transcribes audio into the input language.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
model = 'model_example' # String |
opts = {
  audio_url: 'audio_url_example', # String |
  audio_b64: 'audio_b64_example', # String |
  language: 'language_example' # String |
}

begin
  # Create transcription
  result = api_instance.create_transcription(model, opts)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_transcription: #{e}"
end
```

#### Using the create_transcription_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<AudioTranscriptionResponse>, Integer, Hash)> create_transcription_with_http_info(model, opts)

```ruby
begin
  # Create transcription
  data, status_code, headers = api_instance.create_transcription_with_http_info(model, opts)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <AudioTranscriptionResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_transcription_with_http_info: #{e}"
end
```

### Parameters

| Name          | Type       | Description | Notes      |
| ------------- | ---------- | ----------- | ---------- |
| **model**     | **String** |             |            |
| **audio_url** | **String** |             | [optional] |
| **audio_b64** | **String** |             | [optional] |
| **language**  | **String** |             | [optional] |

### Return type

[**AudioTranscriptionResponse**](AudioTranscriptionResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: multipart/form-data
-   **Accept**: application/json

## create_translation

> <AudioTranslationResponse> create_translation(model, opts)

Create translation

Translates audio into English.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
model = 'model_example' # String |
opts = {
  audio_url: 'audio_url_example', # String |
  audio_b64: 'audio_b64_example', # String |
  language: 'language_example', # String |
  prompt: 'prompt_example', # String |
  temperature: 8.14 # Float |
}

begin
  # Create translation
  result = api_instance.create_translation(model, opts)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_translation: #{e}"
end
```

#### Using the create_translation_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<AudioTranslationResponse>, Integer, Hash)> create_translation_with_http_info(model, opts)

```ruby
begin
  # Create translation
  data, status_code, headers = api_instance.create_translation_with_http_info(model, opts)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <AudioTranslationResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_translation_with_http_info: #{e}"
end
```

### Parameters

| Name            | Type       | Description | Notes      |
| --------------- | ---------- | ----------- | ---------- |
| **model**       | **String** |             |            |
| **audio_url**   | **String** |             | [optional] |
| **audio_b64**   | **String** |             | [optional] |
| **language**    | **String** |             | [optional] |
| **prompt**      | **String** |             | [optional] |
| **temperature** | **Float**  |             | [optional] |

### Return type

[**AudioTranslationResponse**](AudioTranslationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: multipart/form-data
-   **Accept**: application/json

## create_video

> <VideoGenerationResponse> create_video(video_generation_request)

Create video

Creates a video from a prompt.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
video_generation_request = AIStatsSdk::VideoGenerationRequest.new({model: 'model_example', prompt: 'prompt_example'}) # VideoGenerationRequest |

begin
  # Create video
  result = api_instance.create_video(video_generation_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_video: #{e}"
end
```

#### Using the create_video_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<VideoGenerationResponse>, Integer, Hash)> create_video_with_http_info(video_generation_request)

```ruby
begin
  # Create video
  data, status_code, headers = api_instance.create_video_with_http_info(video_generation_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <VideoGenerationResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_video_with_http_info: #{e}"
end
```

### Parameters

| Name                         | Type                                                    | Description | Notes |
| ---------------------------- | ------------------------------------------------------- | ----------- | ----- |
| **video_generation_request** | [**VideoGenerationRequest**](VideoGenerationRequest.md) |             |       |

### Return type

[**VideoGenerationResponse**](VideoGenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

## get_analytics

> <GetAnalytics200Response> get_analytics(get_analytics_request)

Get analytics

Returns aggregated analytics data.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
get_analytics_request = AIStatsSdk::GetAnalyticsRequest.new # GetAnalyticsRequest |

begin
  # Get analytics
  result = api_instance.get_analytics(get_analytics_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_analytics: #{e}"
end
```

#### Using the get_analytics_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<GetAnalytics200Response>, Integer, Hash)> get_analytics_with_http_info(get_analytics_request)

```ruby
begin
  # Get analytics
  data, status_code, headers = api_instance.get_analytics_with_http_info(get_analytics_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <GetAnalytics200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_analytics_with_http_info: #{e}"
end
```

### Parameters

| Name                      | Type                                              | Description | Notes |
| ------------------------- | ------------------------------------------------- | ----------- | ----- |
| **get_analytics_request** | [**GetAnalyticsRequest**](GetAnalyticsRequest.md) |             |       |

### Return type

[**GetAnalytics200Response**](GetAnalytics200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: application/json
-   **Accept**: application/json

## get_generation

> <GenerationResponse> get_generation(id)

Get generation

Retrieve a specific generation by ID.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
id = 'id_example' # String | The ID of the generation

begin
  # Get generation
  result = api_instance.get_generation(id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_generation: #{e}"
end
```

#### Using the get_generation_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<GenerationResponse>, Integer, Hash)> get_generation_with_http_info(id)

```ruby
begin
  # Get generation
  data, status_code, headers = api_instance.get_generation_with_http_info(id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <GenerationResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_generation_with_http_info: #{e}"
end
```

### Parameters

| Name   | Type       | Description              | Notes |
| ------ | ---------- | ------------------------ | ----- |
| **id** | **String** | The ID of the generation |       |

### Return type

[**GenerationResponse**](GenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: application/json

## healthz

> <Healthz200Response> healthz

Health check

Returns the health status of the API.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new

begin
  # Health check
  result = api_instance.healthz
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->healthz: #{e}"
end
```

#### Using the healthz_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<Healthz200Response>, Integer, Hash)> healthz_with_http_info

```ruby
begin
  # Health check
  data, status_code, headers = api_instance.healthz_with_http_info
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <Healthz200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->healthz_with_http_info: #{e}"
end
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**Healthz200Response**](Healthz200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: application/json

## list_files

> <ListFilesResponse> list_files

List files

Returns a list of files that belong to the user's organization.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new

begin
  # List files
  result = api_instance.list_files
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_files: #{e}"
end
```

#### Using the list_files_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<ListFilesResponse>, Integer, Hash)> list_files_with_http_info

```ruby
begin
  # List files
  data, status_code, headers = api_instance.list_files_with_http_info
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <ListFilesResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_files_with_http_info: #{e}"
end
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**ListFilesResponse**](ListFilesResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: application/json

## list_models

> <ListModels200Response> list_models(opts)

List models

Returns a list of available models.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
opts = {
  endpoints: ['inner_example'], # Array<String> | Filter by endpoints
  organisation: nil, # ListModelsOrganisationParameter | Filter by organisation
  input_types: ['inner_example'], # Array<String> | Filter by input types
  output_types: ['inner_example'], # Array<String> | Filter by output types
  params: ['inner_example'], # Array<String> | Filter by params
  limit: 56, # Integer | Limit the number of results
  offset: 56 # Integer | Offset for pagination
}

begin
  # List models
  result = api_instance.list_models(opts)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_models: #{e}"
end
```

#### Using the list_models_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<ListModels200Response>, Integer, Hash)> list_models_with_http_info(opts)

```ruby
begin
  # List models
  data, status_code, headers = api_instance.list_models_with_http_info(opts)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <ListModels200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_models_with_http_info: #{e}"
end
```

### Parameters

| Name             | Type                                       | Description                 | Notes                     |
| ---------------- | ------------------------------------------ | --------------------------- | ------------------------- |
| **endpoints**    | [**Array&lt;String&gt;**](String.md)       | Filter by endpoints         | [optional]                |
| **organisation** | [**ListModelsOrganisationParameter**](.md) | Filter by organisation      | [optional]                |
| **input_types**  | [**Array&lt;String&gt;**](String.md)       | Filter by input types       | [optional]                |
| **output_types** | [**Array&lt;String&gt;**](String.md)       | Filter by output types      | [optional]                |
| **params**       | [**Array&lt;String&gt;**](String.md)       | Filter by params            | [optional]                |
| **limit**        | **Integer**                                | Limit the number of results | [optional][default to 50] |
| **offset**       | **Integer**                                | Offset for pagination       | [optional][default to 0]  |

### Return type

[**ListModels200Response**](ListModels200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: application/json

## retrieve_batch

> <BatchResponse> retrieve_batch(batch_id)

Retrieve batch

Retrieves a batch.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
batch_id = 'batch_id_example' # String | The ID of the batch to retrieve.

begin
  # Retrieve batch
  result = api_instance.retrieve_batch(batch_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->retrieve_batch: #{e}"
end
```

#### Using the retrieve_batch_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<BatchResponse>, Integer, Hash)> retrieve_batch_with_http_info(batch_id)

```ruby
begin
  # Retrieve batch
  data, status_code, headers = api_instance.retrieve_batch_with_http_info(batch_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <BatchResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->retrieve_batch_with_http_info: #{e}"
end
```

### Parameters

| Name         | Type       | Description                      | Notes |
| ------------ | ---------- | -------------------------------- | ----- |
| **batch_id** | **String** | The ID of the batch to retrieve. |       |

### Return type

[**BatchResponse**](BatchResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: application/json

## retrieve_file

> <FileResponse> retrieve_file(file_id)

Retrieve file

Returns information about a specific file.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
file_id = 'file_id_example' # String | The ID of the file to retrieve.

begin
  # Retrieve file
  result = api_instance.retrieve_file(file_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->retrieve_file: #{e}"
end
```

#### Using the retrieve_file_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<FileResponse>, Integer, Hash)> retrieve_file_with_http_info(file_id)

```ruby
begin
  # Retrieve file
  data, status_code, headers = api_instance.retrieve_file_with_http_info(file_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <FileResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->retrieve_file_with_http_info: #{e}"
end
```

### Parameters

| Name        | Type       | Description                     | Notes |
| ----------- | ---------- | ------------------------------- | ----- |
| **file_id** | **String** | The ID of the file to retrieve. |       |

### Return type

[**FileResponse**](FileResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: application/json

## root

> <Root200Response> root

Root endpoint

Returns a welcome message.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new

begin
  # Root endpoint
  result = api_instance.root
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->root: #{e}"
end
```

#### Using the root_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<Root200Response>, Integer, Hash)> root_with_http_info

```ruby
begin
  # Root endpoint
  data, status_code, headers = api_instance.root_with_http_info
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <Root200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->root_with_http_info: #{e}"
end
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**Root200Response**](Root200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: Not defined
-   **Accept**: application/json

## upload_file

> <FileResponse> upload_file(file, purpose)

Upload file

Upload a file that can be used across various endpoints.

### Examples

```ruby
require 'time'
require 'ai_stats_sdk'
# setup authorization
AIStatsSdk.configure do |config|
  # Configure Bearer authorization: BearerAuth
  config.access_token = 'YOUR_BEARER_TOKEN'
end

api_instance = AIStatsSdk::DefaultApi.new
file = File.new('/path/to/some/file') # File |
purpose = 'purpose_example' # String |

begin
  # Upload file
  result = api_instance.upload_file(file, purpose)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->upload_file: #{e}"
end
```

#### Using the upload_file_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<FileResponse>, Integer, Hash)> upload_file_with_http_info(file, purpose)

```ruby
begin
  # Upload file
  data, status_code, headers = api_instance.upload_file_with_http_info(file, purpose)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <FileResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->upload_file_with_http_info: #{e}"
end
```

### Parameters

| Name        | Type       | Description | Notes |
| ----------- | ---------- | ----------- | ----- |
| **file**    | **File**   |             |       |
| **purpose** | **String** |             |       |

### Return type

[**FileResponse**](FileResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

-   **Content-Type**: multipart/form-data
-   **Accept**: application/json
