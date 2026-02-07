# AIStatsSdk::DefaultApi

All URIs are relative to *https://api.phaseo.app/v1*

| Method | HTTP request | Description |
| ------ | ------------ | ----------- |
| [**create_anthropic_message**](DefaultApi.md#create_anthropic_message) | **POST** /messages | Create message |
| [**create_batch**](DefaultApi.md#create_batch) | **POST** /batches | Create batch |
| [**create_chat_completion**](DefaultApi.md#create_chat_completion) | **POST** /chat/completions | Create chat completion |
| [**create_embedding**](DefaultApi.md#create_embedding) | **POST** /embeddings | Create embeddings |
| [**create_image**](DefaultApi.md#create_image) | **POST** /images/generations | Create image |
| [**create_image_edit**](DefaultApi.md#create_image_edit) | **POST** /images/edits | Create image edit |
| [**create_moderation**](DefaultApi.md#create_moderation) | **POST** /moderations | Create moderation |
| [**create_ocr**](DefaultApi.md#create_ocr) | **POST** /ocr | Create OCR |
| [**create_provisioning_key**](DefaultApi.md#create_provisioning_key) | **POST** /provisioning/keys | Create provisioning key |
| [**create_response**](DefaultApi.md#create_response) | **POST** /responses | Create response |
| [**create_speech**](DefaultApi.md#create_speech) | **POST** /audio/speech | Generate speech |
| [**create_transcription**](DefaultApi.md#create_transcription) | **POST** /audio/transcriptions | Create transcription |
| [**create_translation**](DefaultApi.md#create_translation) | **POST** /audio/translations | Create translation |
| [**create_video**](DefaultApi.md#create_video) | **POST** /videos | Create video |
| [**delete_provisioning_key**](DefaultApi.md#delete_provisioning_key) | **DELETE** /provisioning/keys/{id} | Delete provisioning key |
| [**delete_video**](DefaultApi.md#delete_video) | **DELETE** /videos/{video_id} | Delete video |
| [**generate_music**](DefaultApi.md#generate_music) | **POST** /music/generate | Generate music |
| [**get_activity**](DefaultApi.md#get_activity) | **GET** /activity | Get activity |
| [**get_analytics**](DefaultApi.md#get_analytics) | **POST** /analytics | Get analytics |
| [**get_credits**](DefaultApi.md#get_credits) | **GET** /credits | Get remaining credits |
| [**get_generation**](DefaultApi.md#get_generation) | **GET** /generation | Get generation |
| [**get_provisioning_key**](DefaultApi.md#get_provisioning_key) | **GET** /provisioning/keys/{id} | Get provisioning key |
| [**get_video**](DefaultApi.md#get_video) | **GET** /videos/{video_id} | Get video status |
| [**get_video_content**](DefaultApi.md#get_video_content) | **GET** /videos/{video_id}/content | Get video content |
| [**healthz**](DefaultApi.md#healthz) | **GET** /healthz | Health check |
| [**list_files**](DefaultApi.md#list_files) | **GET** /files | List files |
| [**list_models**](DefaultApi.md#list_models) | **GET** /models | List models |
| [**list_providers**](DefaultApi.md#list_providers) | **GET** /providers | List providers |
| [**list_provisioning_keys**](DefaultApi.md#list_provisioning_keys) | **GET** /provisioning/keys | List provisioning keys |
| [**retrieve_batch**](DefaultApi.md#retrieve_batch) | **GET** /batches/{batch_id} | Retrieve batch |
| [**retrieve_file**](DefaultApi.md#retrieve_file) | **GET** /files/{file_id} | Retrieve file |
| [**root**](DefaultApi.md#root) | **GET** / | Root endpoint |
| [**update_provisioning_key**](DefaultApi.md#update_provisioning_key) | **PATCH** /provisioning/keys/{id} | Update provisioning key |
| [**upload_file**](DefaultApi.md#upload_file) | **POST** /files | Upload file |


## create_anthropic_message

> <AnthropicMessagesResponse> create_anthropic_message(anthropic_messages_request)

Create message

Creates a message using the Anthropic Messages API.

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
anthropic_messages_request = AIStatsSdk::AnthropicMessagesRequest.new({model: 'model_example', messages: [AIStatsSdk::AnthropicMessage.new({role: 'user', content: nil})]}) # AnthropicMessagesRequest | 

begin
  # Create message
  result = api_instance.create_anthropic_message(anthropic_messages_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_anthropic_message: #{e}"
end
```

#### Using the create_anthropic_message_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<AnthropicMessagesResponse>, Integer, Hash)> create_anthropic_message_with_http_info(anthropic_messages_request)

```ruby
begin
  # Create message
  data, status_code, headers = api_instance.create_anthropic_message_with_http_info(anthropic_messages_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <AnthropicMessagesResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_anthropic_message_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **anthropic_messages_request** | [**AnthropicMessagesRequest**](AnthropicMessagesRequest.md) |  |  |

### Return type

[**AnthropicMessagesResponse**](AnthropicMessagesResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json, text/event-stream


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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **batch_request** | [**BatchRequest**](BatchRequest.md) |  |  |

### Return type

[**BatchResponse**](BatchResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **chat_completions_request** | [**ChatCompletionsRequest**](ChatCompletionsRequest.md) |  |  |

### Return type

[**ChatCompletionsResponse**](ChatCompletionsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


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
embeddings_request = AIStatsSdk::EmbeddingsRequest.new # EmbeddingsRequest | 

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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **embeddings_request** | [**EmbeddingsRequest**](EmbeddingsRequest.md) |  |  |

### Return type

[**EmbeddingsResponse**](EmbeddingsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **images_generation_request** | [**ImagesGenerationRequest**](ImagesGenerationRequest.md) |  |  |

### Return type

[**ImagesGenerationResponse**](ImagesGenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


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
  usage: true, # Boolean | 
  provider: AIStatsSdk::ProviderRoutingOptions.new # ProviderRoutingOptions | 
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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **image** | **String** |  |  |
| **prompt** | **String** |  |  |
| **mask** | **String** |  | [optional] |
| **size** | **String** |  | [optional] |
| **n** | **Integer** |  | [optional] |
| **user** | **String** |  | [optional] |
| **meta** | **Boolean** |  | [optional] |
| **usage** | **Boolean** |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

### Return type

[**ImagesEditResponse**](ImagesEditResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: multipart/form-data
- **Accept**: application/json


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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **moderations_request** | [**ModerationsRequest**](ModerationsRequest.md) |  |  |

### Return type

[**ModerationsResponse**](ModerationsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


## create_ocr

> Hash&lt;String, Object&gt; create_ocr(ocr_request)

Create OCR

Extracts text from an image using the requested model.

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
ocr_request = AIStatsSdk::OcrRequest.new({model: 'model_example', image: 'image_example'}) # OcrRequest | 

begin
  # Create OCR
  result = api_instance.create_ocr(ocr_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_ocr: #{e}"
end
```

#### Using the create_ocr_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> create_ocr_with_http_info(ocr_request)

```ruby
begin
  # Create OCR
  data, status_code, headers = api_instance.create_ocr_with_http_info(ocr_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_ocr_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **ocr_request** | [**OcrRequest**](OcrRequest.md) |  |  |

### Return type

**Hash&lt;String, Object&gt;**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


## create_provisioning_key

> <CreateProvisioningKey201Response> create_provisioning_key(create_provisioning_key_request)

Create provisioning key

Creates a new provisioning key for a team.

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
create_provisioning_key_request = AIStatsSdk::CreateProvisioningKeyRequest.new({team_id: 'team_id_example', name: 'name_example', created_by: 'created_by_example'}) # CreateProvisioningKeyRequest | 

begin
  # Create provisioning key
  result = api_instance.create_provisioning_key(create_provisioning_key_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_provisioning_key: #{e}"
end
```

#### Using the create_provisioning_key_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<CreateProvisioningKey201Response>, Integer, Hash)> create_provisioning_key_with_http_info(create_provisioning_key_request)

```ruby
begin
  # Create provisioning key
  data, status_code, headers = api_instance.create_provisioning_key_with_http_info(create_provisioning_key_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <CreateProvisioningKey201Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_provisioning_key_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **create_provisioning_key_request** | [**CreateProvisioningKeyRequest**](CreateProvisioningKeyRequest.md) |  |  |

### Return type

[**CreateProvisioningKey201Response**](CreateProvisioningKey201Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **responses_request** | [**ResponsesRequest**](ResponsesRequest.md) |  |  |

### Return type

[**ResponsesResponse**](ResponsesResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **audio_speech_request** | [**AudioSpeechRequest**](AudioSpeechRequest.md) |  |  |

### Return type

**File**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: audio/mpeg


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
  language: 'language_example', # String | 
  provider: AIStatsSdk::ProviderRoutingOptions.new # ProviderRoutingOptions | 
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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **audio_url** | **String** |  | [optional] |
| **audio_b64** | **String** |  | [optional] |
| **language** | **String** |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

### Return type

[**AudioTranscriptionResponse**](AudioTranscriptionResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: multipart/form-data
- **Accept**: application/json


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
  temperature: 8.14, # Float | 
  provider: AIStatsSdk::ProviderRoutingOptions.new # ProviderRoutingOptions | 
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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **model** | **String** |  |  |
| **audio_url** | **String** |  | [optional] |
| **audio_b64** | **String** |  | [optional] |
| **language** | **String** |  | [optional] |
| **prompt** | **String** |  | [optional] |
| **temperature** | **Float** |  | [optional] |
| **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] |

### Return type

[**AudioTranslationResponse**](AudioTranslationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: multipart/form-data
- **Accept**: application/json


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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **video_generation_request** | [**VideoGenerationRequest**](VideoGenerationRequest.md) |  |  |

### Return type

[**VideoGenerationResponse**](VideoGenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


## delete_provisioning_key

> <DeleteProvisioningKey200Response> delete_provisioning_key(id)

Delete provisioning key

Permanently deletes a provisioning key.

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
id = 'id_example' # String | The provisioning key ID

begin
  # Delete provisioning key
  result = api_instance.delete_provisioning_key(id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->delete_provisioning_key: #{e}"
end
```

#### Using the delete_provisioning_key_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<DeleteProvisioningKey200Response>, Integer, Hash)> delete_provisioning_key_with_http_info(id)

```ruby
begin
  # Delete provisioning key
  data, status_code, headers = api_instance.delete_provisioning_key_with_http_info(id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <DeleteProvisioningKey200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->delete_provisioning_key_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** | The provisioning key ID |  |

### Return type

[**DeleteProvisioningKey200Response**](DeleteProvisioningKey200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## delete_video

> <VideoDeleteResponse> delete_video(video_id)

Delete video

Deletes a video generation request.

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
video_id = 'video_id_example' # String | The ID of the video generation request.

begin
  # Delete video
  result = api_instance.delete_video(video_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->delete_video: #{e}"
end
```

#### Using the delete_video_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<VideoDeleteResponse>, Integer, Hash)> delete_video_with_http_info(video_id)

```ruby
begin
  # Delete video
  data, status_code, headers = api_instance.delete_video_with_http_info(video_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <VideoDeleteResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->delete_video_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **video_id** | **String** | The ID of the video generation request. |  |

### Return type

[**VideoDeleteResponse**](VideoDeleteResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## generate_music

> Hash&lt;String, Object&gt; generate_music(music_generate_request)

Generate music

Generates music using the requested model and provider settings.

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
music_generate_request = AIStatsSdk::MusicGenerateRequest.new({model: 'model_example'}) # MusicGenerateRequest | 

begin
  # Generate music
  result = api_instance.generate_music(music_generate_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->generate_music: #{e}"
end
```

#### Using the generate_music_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> generate_music_with_http_info(music_generate_request)

```ruby
begin
  # Generate music
  data, status_code, headers = api_instance.generate_music_with_http_info(music_generate_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->generate_music_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **music_generate_request** | [**MusicGenerateRequest**](MusicGenerateRequest.md) |  |  |

### Return type

**Hash&lt;String, Object&gt;**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


## get_activity

> <GetActivity200Response> get_activity(team_id, opts)

Get activity

Returns recent API activity for a team.

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
team_id = 'team_id_example' # String | The team ID to query
opts = {
  days: 56, # Integer | Number of days to look back
  limit: 56, # Integer | Maximum number of records to return
  offset: 56 # Integer | Pagination offset
}

begin
  # Get activity
  result = api_instance.get_activity(team_id, opts)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_activity: #{e}"
end
```

#### Using the get_activity_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<GetActivity200Response>, Integer, Hash)> get_activity_with_http_info(team_id, opts)

```ruby
begin
  # Get activity
  data, status_code, headers = api_instance.get_activity_with_http_info(team_id, opts)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <GetActivity200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_activity_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **team_id** | **String** | The team ID to query |  |
| **days** | **Integer** | Number of days to look back | [optional][default to 30] |
| **limit** | **Integer** | Maximum number of records to return | [optional][default to 50] |
| **offset** | **Integer** | Pagination offset | [optional][default to 0] |

### Return type

[**GetActivity200Response**](GetActivity200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **get_analytics_request** | [**GetAnalyticsRequest**](GetAnalyticsRequest.md) |  |  |

### Return type

[**GetAnalytics200Response**](GetAnalytics200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


## get_credits

> <GetCredits200Response> get_credits(team_id)

Get remaining credits

Returns the remaining credits and usage statistics for a team.

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
team_id = 'team_id_example' # String | The team ID to query

begin
  # Get remaining credits
  result = api_instance.get_credits(team_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_credits: #{e}"
end
```

#### Using the get_credits_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<GetCredits200Response>, Integer, Hash)> get_credits_with_http_info(team_id)

```ruby
begin
  # Get remaining credits
  data, status_code, headers = api_instance.get_credits_with_http_info(team_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <GetCredits200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_credits_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **team_id** | **String** | The team ID to query |  |

### Return type

[**GetCredits200Response**](GetCredits200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** | The ID of the generation |  |

### Return type

[**GenerationResponse**](GenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## get_provisioning_key

> <GetProvisioningKey200Response> get_provisioning_key(id)

Get provisioning key

Returns details of a specific provisioning key.

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
id = 'id_example' # String | The provisioning key ID

begin
  # Get provisioning key
  result = api_instance.get_provisioning_key(id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_provisioning_key: #{e}"
end
```

#### Using the get_provisioning_key_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<GetProvisioningKey200Response>, Integer, Hash)> get_provisioning_key_with_http_info(id)

```ruby
begin
  # Get provisioning key
  data, status_code, headers = api_instance.get_provisioning_key_with_http_info(id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <GetProvisioningKey200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_provisioning_key_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** | The provisioning key ID |  |

### Return type

[**GetProvisioningKey200Response**](GetProvisioningKey200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## get_video

> <VideoGenerationResponse> get_video(video_id)

Get video status

Retrieves the status for a video generation request.

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
video_id = 'video_id_example' # String | The ID of the video generation request.

begin
  # Get video status
  result = api_instance.get_video(video_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_video: #{e}"
end
```

#### Using the get_video_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<VideoGenerationResponse>, Integer, Hash)> get_video_with_http_info(video_id)

```ruby
begin
  # Get video status
  data, status_code, headers = api_instance.get_video_with_http_info(video_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <VideoGenerationResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_video_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **video_id** | **String** | The ID of the video generation request. |  |

### Return type

[**VideoGenerationResponse**](VideoGenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## get_video_content

> File get_video_content(video_id)

Get video content

Downloads the rendered video content.

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
video_id = 'video_id_example' # String | The ID of the video generation request.

begin
  # Get video content
  result = api_instance.get_video_content(video_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_video_content: #{e}"
end
```

#### Using the get_video_content_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(File, Integer, Hash)> get_video_content_with_http_info(video_id)

```ruby
begin
  # Get video content
  data, status_code, headers = api_instance.get_video_content_with_http_info(video_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => File
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_video_content_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **video_id** | **String** | The ID of the video generation request. |  |

### Return type

**File**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/octet-stream


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

- **Content-Type**: Not defined
- **Accept**: application/json


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

- **Content-Type**: Not defined
- **Accept**: application/json


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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **endpoints** | [**Array&lt;String&gt;**](String.md) | Filter by endpoints | [optional] |
| **organisation** | [**ListModelsOrganisationParameter**](.md) | Filter by organisation | [optional] |
| **input_types** | [**Array&lt;String&gt;**](String.md) | Filter by input types | [optional] |
| **output_types** | [**Array&lt;String&gt;**](String.md) | Filter by output types | [optional] |
| **params** | [**Array&lt;String&gt;**](String.md) | Filter by params | [optional] |
| **limit** | **Integer** | Limit the number of results | [optional][default to 50] |
| **offset** | **Integer** | Offset for pagination | [optional][default to 0] |

### Return type

[**ListModels200Response**](ListModels200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## list_providers

> <ListProviders200Response> list_providers(opts)

List providers

Returns a list of available API providers.

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
  limit: 56, # Integer | Limit the number of results
  offset: 56 # Integer | Offset for pagination
}

begin
  # List providers
  result = api_instance.list_providers(opts)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_providers: #{e}"
end
```

#### Using the list_providers_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<ListProviders200Response>, Integer, Hash)> list_providers_with_http_info(opts)

```ruby
begin
  # List providers
  data, status_code, headers = api_instance.list_providers_with_http_info(opts)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <ListProviders200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_providers_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **limit** | **Integer** | Limit the number of results | [optional][default to 50] |
| **offset** | **Integer** | Offset for pagination | [optional][default to 0] |

### Return type

[**ListProviders200Response**](ListProviders200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## list_provisioning_keys

> <ListProvisioningKeys200Response> list_provisioning_keys(team_id, opts)

List provisioning keys

Returns all provisioning keys for a team.

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
team_id = 'team_id_example' # String | The team ID to query
opts = {
  limit: 56, # Integer | Maximum number of keys to return
  offset: 56 # Integer | Pagination offset
}

begin
  # List provisioning keys
  result = api_instance.list_provisioning_keys(team_id, opts)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_provisioning_keys: #{e}"
end
```

#### Using the list_provisioning_keys_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<ListProvisioningKeys200Response>, Integer, Hash)> list_provisioning_keys_with_http_info(team_id, opts)

```ruby
begin
  # List provisioning keys
  data, status_code, headers = api_instance.list_provisioning_keys_with_http_info(team_id, opts)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <ListProvisioningKeys200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_provisioning_keys_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **team_id** | **String** | The team ID to query |  |
| **limit** | **Integer** | Maximum number of keys to return | [optional][default to 50] |
| **offset** | **Integer** | Pagination offset | [optional][default to 0] |

### Return type

[**ListProvisioningKeys200Response**](ListProvisioningKeys200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **batch_id** | **String** | The ID of the batch to retrieve. |  |

### Return type

[**BatchResponse**](BatchResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **file_id** | **String** | The ID of the file to retrieve. |  |

### Return type

[**FileResponse**](FileResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


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

- **Content-Type**: Not defined
- **Accept**: application/json


## update_provisioning_key

> <UpdateProvisioningKey200Response> update_provisioning_key(id, update_provisioning_key_request)

Update provisioning key

Updates the name, status, or blocked state of a provisioning key.

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
id = 'id_example' # String | The provisioning key ID
update_provisioning_key_request = AIStatsSdk::UpdateProvisioningKeyRequest.new # UpdateProvisioningKeyRequest | 

begin
  # Update provisioning key
  result = api_instance.update_provisioning_key(id, update_provisioning_key_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->update_provisioning_key: #{e}"
end
```

#### Using the update_provisioning_key_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<UpdateProvisioningKey200Response>, Integer, Hash)> update_provisioning_key_with_http_info(id, update_provisioning_key_request)

```ruby
begin
  # Update provisioning key
  data, status_code, headers = api_instance.update_provisioning_key_with_http_info(id, update_provisioning_key_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <UpdateProvisioningKey200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->update_provisioning_key_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** | The provisioning key ID |  |
| **update_provisioning_key_request** | [**UpdateProvisioningKeyRequest**](UpdateProvisioningKeyRequest.md) |  |  |

### Return type

[**UpdateProvisioningKey200Response**](UpdateProvisioningKey200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


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

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **file** | **File** |  |  |
| **purpose** | **String** |  |  |

### Return type

[**FileResponse**](FileResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: multipart/form-data
- **Accept**: application/json

