# AIStatsSdk::DefaultApi

All URIs are relative to *https://api.phaseo.app/v1*

| Method | HTTP request | Description |
| ------ | ------------ | ----------- |
| [**calculate_pricing**](DefaultApi.md#calculate_pricing) | **POST** /pricing/calculate | Calculate pricing |
| [**create_anthropic_message**](DefaultApi.md#create_anthropic_message) | **POST** /messages | Create message |
| [**create_batch**](DefaultApi.md#create_batch) | **POST** /batches | Create batch |
| [**create_batch_alias**](DefaultApi.md#create_batch_alias) | **POST** /batch | Create batch (alias) |
| [**create_chat_completion**](DefaultApi.md#create_chat_completion) | **POST** /chat/completions | Create chat completion |
| [**create_embedding**](DefaultApi.md#create_embedding) | **POST** /embeddings | Create embeddings |
| [**create_image**](DefaultApi.md#create_image) | **POST** /images/generations | Create image |
| [**create_image_edit**](DefaultApi.md#create_image_edit) | **POST** /images/edits | Create image edit |
| [**create_key_placeholder**](DefaultApi.md#create_key_placeholder) | **POST** /keys | Create key (placeholder) |
| [**create_moderation**](DefaultApi.md#create_moderation) | **POST** /moderations | Create moderation |
| [**create_o_auth_client**](DefaultApi.md#create_o_auth_client) | **POST** /oauth-clients | Create OAuth client |
| [**create_ocr**](DefaultApi.md#create_ocr) | **POST** /ocr | Create OCR |
| [**create_response**](DefaultApi.md#create_response) | **POST** /responses | Create response |
| [**create_speech**](DefaultApi.md#create_speech) | **POST** /audio/speech | Generate speech |
| [**create_transcription**](DefaultApi.md#create_transcription) | **POST** /audio/transcriptions | Create transcription |
| [**create_translation**](DefaultApi.md#create_translation) | **POST** /audio/translations | Create translation |
| [**create_video**](DefaultApi.md#create_video) | **POST** /videos | Create video |
| [**create_video_alias**](DefaultApi.md#create_video_alias) | **POST** /video/generations | Create video (alias) |
| [**delete_o_auth_client**](DefaultApi.md#delete_o_auth_client) | **DELETE** /oauth-clients/{client_id} | Delete OAuth client |
| [**delete_provisioning_key**](DefaultApi.md#delete_provisioning_key) | **DELETE** /management/keys/{id} | Delete management API key |
| [**delete_provisioning_key_alias**](DefaultApi.md#delete_provisioning_key_alias) | **DELETE** /provisioning/keys/{id} | Delete provisioning key |
| [**delete_video**](DefaultApi.md#delete_video) | **DELETE** /videos/{video_id} | Delete video |
| [**delete_video_alias**](DefaultApi.md#delete_video_alias) | **DELETE** /video/generations/{video_id} | Delete video (alias) |
| [**generate_music**](DefaultApi.md#generate_music) | **POST** /music/generate | Generate music |
| [**generate_music_alias**](DefaultApi.md#generate_music_alias) | **POST** /music/generations | Generate music (alias) |
| [**get_activity**](DefaultApi.md#get_activity) | **GET** /activity | Get activity |
| [**get_analytics**](DefaultApi.md#get_analytics) | **POST** /analytics | Get analytics |
| [**get_credits**](DefaultApi.md#get_credits) | **GET** /credits | Get remaining credits |
| [**get_generation**](DefaultApi.md#get_generation) | **GET** /generations | Get generation |
| [**get_key_placeholder**](DefaultApi.md#get_key_placeholder) | **GET** /key | Get key (placeholder) |
| [**get_music_generation**](DefaultApi.md#get_music_generation) | **GET** /music/generate/{music_id} | Get music generation status |
| [**get_music_generation_alias**](DefaultApi.md#get_music_generation_alias) | **GET** /music/generations/{music_id} | Get music generation status (alias) |
| [**get_o_auth_client**](DefaultApi.md#get_o_auth_client) | **GET** /oauth-clients/{client_id} | Get OAuth client |
| [**get_provider_derank_status**](DefaultApi.md#get_provider_derank_status) | **GET** /health/providers/{provider_id}/derank | Provider derank status |
| [**get_provisioning_key**](DefaultApi.md#get_provisioning_key) | **GET** /management/keys/{id} | Get management API key |
| [**get_provisioning_key_alias**](DefaultApi.md#get_provisioning_key_alias) | **GET** /provisioning/keys/{id} | Get provisioning key |
| [**get_video**](DefaultApi.md#get_video) | **GET** /videos/{video_id} | Get video status |
| [**get_video_alias**](DefaultApi.md#get_video_alias) | **GET** /video/generations/{video_id} | Get video status (alias) |
| [**get_video_content**](DefaultApi.md#get_video_content) | **GET** /videos/{video_id}/content | Get video content |
| [**get_video_content_alias**](DefaultApi.md#get_video_content_alias) | **GET** /video/generations/{video_id}/content | Get video content (alias) |
| [**healthz**](DefaultApi.md#healthz) | **GET** /health | Health check |
| [**invalidate_gateway_key_cache**](DefaultApi.md#invalidate_gateway_key_cache) | **POST** /keys/{id}/invalidate | Invalidate key cache |
| [**list_endpoints_placeholder**](DefaultApi.md#list_endpoints_placeholder) | **GET** /endpoints | List endpoints (placeholder) |
| [**list_files**](DefaultApi.md#list_files) | **GET** /files | List files |
| [**list_keys_placeholder**](DefaultApi.md#list_keys_placeholder) | **GET** /keys | List keys (placeholder) |
| [**list_models**](DefaultApi.md#list_models) | **GET** /models | List models |
| [**list_o_auth_clients**](DefaultApi.md#list_o_auth_clients) | **GET** /oauth-clients | List OAuth clients |
| [**list_organisations**](DefaultApi.md#list_organisations) | **GET** /organisations | List organisations |
| [**list_pricing_models**](DefaultApi.md#list_pricing_models) | **GET** /pricing/models | List pricing models |
| [**list_providers**](DefaultApi.md#list_providers) | **GET** /providers | List providers |
| [**list_provisioning_keys**](DefaultApi.md#list_provisioning_keys) | **GET** /management/keys | List management API keys |
| [**list_provisioning_keys_alias**](DefaultApi.md#list_provisioning_keys_alias) | **GET** /provisioning/keys | List provisioning keys |
| [**regenerate_o_auth_client_secret**](DefaultApi.md#regenerate_o_auth_client_secret) | **POST** /oauth-clients/{client_id}/regenerate-secret | Regenerate OAuth client secret |
| [**retrieve_batch**](DefaultApi.md#retrieve_batch) | **GET** /batches/{batch_id} | Retrieve batch |
| [**retrieve_batch_alias**](DefaultApi.md#retrieve_batch_alias) | **GET** /batch/{id} | Retrieve batch (alias) |
| [**retrieve_file**](DefaultApi.md#retrieve_file) | **GET** /files/{file_id} | Retrieve file |
| [**root**](DefaultApi.md#root) | **GET** / | Root endpoint |
| [**update_o_auth_client**](DefaultApi.md#update_o_auth_client) | **PATCH** /oauth-clients/{client_id} | Update OAuth client |
| [**update_provisioning_key**](DefaultApi.md#update_provisioning_key) | **PATCH** /management/keys/{id} | Update management API key |
| [**update_provisioning_key_alias**](DefaultApi.md#update_provisioning_key_alias) | **PATCH** /provisioning/keys/{id} | Update provisioning key |
| [**upload_file**](DefaultApi.md#upload_file) | **POST** /files | Upload file |


## calculate_pricing

> <CalculatePricing200Response> calculate_pricing(calculate_pricing_request)

Calculate pricing

Calculates price for a usage payload.

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
calculate_pricing_request = AIStatsSdk::CalculatePricingRequest.new({provider: 'provider_example', model: 'model_example', endpoint: 'endpoint_example', usage: { key: 3.56}}) # CalculatePricingRequest | 

begin
  # Calculate pricing
  result = api_instance.calculate_pricing(calculate_pricing_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->calculate_pricing: #{e}"
end
```

#### Using the calculate_pricing_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<CalculatePricing200Response>, Integer, Hash)> calculate_pricing_with_http_info(calculate_pricing_request)

```ruby
begin
  # Calculate pricing
  data, status_code, headers = api_instance.calculate_pricing_with_http_info(calculate_pricing_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <CalculatePricing200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->calculate_pricing_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **calculate_pricing_request** | [**CalculatePricingRequest**](CalculatePricingRequest.md) |  |  |

### Return type

[**CalculatePricing200Response**](CalculatePricing200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


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


## create_batch_alias

> <BatchResponse> create_batch_alias(batch_request)

Create batch (alias)

Alias of /batches.

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
  # Create batch (alias)
  result = api_instance.create_batch_alias(batch_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_batch_alias: #{e}"
end
```

#### Using the create_batch_alias_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<BatchResponse>, Integer, Hash)> create_batch_alias_with_http_info(batch_request)

```ruby
begin
  # Create batch (alias)
  data, status_code, headers = api_instance.create_batch_alias_with_http_info(batch_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <BatchResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_batch_alias_with_http_info: #{e}"
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


## create_key_placeholder

> create_key_placeholder

Create key (placeholder)

Placeholder route; currently returns not implemented.

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
  # Create key (placeholder)
  api_instance.create_key_placeholder
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_key_placeholder: #{e}"
end
```

#### Using the create_key_placeholder_with_http_info variant

This returns an Array which contains the response data (`nil` in this case), status code and headers.

> <Array(nil, Integer, Hash)> create_key_placeholder_with_http_info

```ruby
begin
  # Create key (placeholder)
  data, status_code, headers = api_instance.create_key_placeholder_with_http_info
  p status_code # => 2xx
  p headers # => { ... }
  p data # => nil
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_key_placeholder_with_http_info: #{e}"
end
```

### Parameters

This endpoint does not need any parameter.

### Return type

nil (empty response body)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
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


## create_o_auth_client

> Hash&lt;String, Object&gt; create_o_auth_client(create_o_auth_client_request)

Create OAuth client

Creates a team-scoped OAuth client.

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
create_o_auth_client_request = AIStatsSdk::CreateOAuthClientRequest.new({name: 'name_example', redirect_uris: ['redirect_uris_example']}) # CreateOAuthClientRequest | 

begin
  # Create OAuth client
  result = api_instance.create_o_auth_client(create_o_auth_client_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_o_auth_client: #{e}"
end
```

#### Using the create_o_auth_client_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> create_o_auth_client_with_http_info(create_o_auth_client_request)

```ruby
begin
  # Create OAuth client
  data, status_code, headers = api_instance.create_o_auth_client_with_http_info(create_o_auth_client_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_o_auth_client_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **create_o_auth_client_request** | [**CreateOAuthClientRequest**](CreateOAuthClientRequest.md) |  |  |

### Return type

**Hash&lt;String, Object&gt;**

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


## create_video_alias

> <VideoGenerationResponse> create_video_alias(video_generation_request)

Create video (alias)

Alias of /videos.

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
  # Create video (alias)
  result = api_instance.create_video_alias(video_generation_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_video_alias: #{e}"
end
```

#### Using the create_video_alias_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<VideoGenerationResponse>, Integer, Hash)> create_video_alias_with_http_info(video_generation_request)

```ruby
begin
  # Create video (alias)
  data, status_code, headers = api_instance.create_video_alias_with_http_info(video_generation_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <VideoGenerationResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->create_video_alias_with_http_info: #{e}"
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


## delete_o_auth_client

> Hash&lt;String, Object&gt; delete_o_auth_client(client_id)

Delete OAuth client

Deletes an OAuth client and related metadata.

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
client_id = 'client_id_example' # String | 

begin
  # Delete OAuth client
  result = api_instance.delete_o_auth_client(client_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->delete_o_auth_client: #{e}"
end
```

#### Using the delete_o_auth_client_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> delete_o_auth_client_with_http_info(client_id)

```ruby
begin
  # Delete OAuth client
  data, status_code, headers = api_instance.delete_o_auth_client_with_http_info(client_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->delete_o_auth_client_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **client_id** | **String** |  |  |

### Return type

**Hash&lt;String, Object&gt;**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## delete_provisioning_key

> <DeleteProvisioningKey200Response> delete_provisioning_key(id)

Delete management API key

Permanently deletes a management API key.

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
id = 'id_example' # String | The management API key ID

begin
  # Delete management API key
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
  # Delete management API key
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
| **id** | **String** | The management API key ID |  |

### Return type

[**DeleteProvisioningKey200Response**](DeleteProvisioningKey200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## delete_provisioning_key_alias

> Hash&lt;String, Object&gt; delete_provisioning_key_alias(id)

Delete provisioning key

Alias of management key delete endpoint.

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
id = 'id_example' # String | 

begin
  # Delete provisioning key
  result = api_instance.delete_provisioning_key_alias(id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->delete_provisioning_key_alias: #{e}"
end
```

#### Using the delete_provisioning_key_alias_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> delete_provisioning_key_alias_with_http_info(id)

```ruby
begin
  # Delete provisioning key
  data, status_code, headers = api_instance.delete_provisioning_key_alias_with_http_info(id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->delete_provisioning_key_alias_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  |  |

### Return type

**Hash&lt;String, Object&gt;**

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


## delete_video_alias

> <VideoDeleteResponse> delete_video_alias(video_id)

Delete video (alias)

Alias of /videos/{video_id}.

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
video_id = 'video_id_example' # String | 

begin
  # Delete video (alias)
  result = api_instance.delete_video_alias(video_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->delete_video_alias: #{e}"
end
```

#### Using the delete_video_alias_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<VideoDeleteResponse>, Integer, Hash)> delete_video_alias_with_http_info(video_id)

```ruby
begin
  # Delete video (alias)
  data, status_code, headers = api_instance.delete_video_alias_with_http_info(video_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <VideoDeleteResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->delete_video_alias_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **video_id** | **String** |  |  |

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


## generate_music_alias

> Hash&lt;String, Object&gt; generate_music_alias(music_generate_request)

Generate music (alias)

Alias of /music/generate.

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
  # Generate music (alias)
  result = api_instance.generate_music_alias(music_generate_request)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->generate_music_alias: #{e}"
end
```

#### Using the generate_music_alias_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> generate_music_alias_with_http_info(music_generate_request)

```ruby
begin
  # Generate music (alias)
  data, status_code, headers = api_instance.generate_music_alias_with_http_info(music_generate_request)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->generate_music_alias_with_http_info: #{e}"
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


## get_key_placeholder

> get_key_placeholder

Get key (placeholder)

Placeholder route; currently returns not implemented.

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
  # Get key (placeholder)
  api_instance.get_key_placeholder
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_key_placeholder: #{e}"
end
```

#### Using the get_key_placeholder_with_http_info variant

This returns an Array which contains the response data (`nil` in this case), status code and headers.

> <Array(nil, Integer, Hash)> get_key_placeholder_with_http_info

```ruby
begin
  # Get key (placeholder)
  data, status_code, headers = api_instance.get_key_placeholder_with_http_info
  p status_code # => 2xx
  p headers # => { ... }
  p data # => nil
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_key_placeholder_with_http_info: #{e}"
end
```

### Parameters

This endpoint does not need any parameter.

### Return type

nil (empty response body)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## get_music_generation

> Hash&lt;String, Object&gt; get_music_generation(music_id)

Get music generation status

Retrieves the status for a music generation request.

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
music_id = 'music_id_example' # String | The ID of the music generation request.

begin
  # Get music generation status
  result = api_instance.get_music_generation(music_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_music_generation: #{e}"
end
```

#### Using the get_music_generation_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> get_music_generation_with_http_info(music_id)

```ruby
begin
  # Get music generation status
  data, status_code, headers = api_instance.get_music_generation_with_http_info(music_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_music_generation_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **music_id** | **String** | The ID of the music generation request. |  |

### Return type

**Hash&lt;String, Object&gt;**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## get_music_generation_alias

> Hash&lt;String, Object&gt; get_music_generation_alias(music_id)

Get music generation status (alias)

Alias of /music/generate/{music_id}.

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
music_id = 'music_id_example' # String | 

begin
  # Get music generation status (alias)
  result = api_instance.get_music_generation_alias(music_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_music_generation_alias: #{e}"
end
```

#### Using the get_music_generation_alias_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> get_music_generation_alias_with_http_info(music_id)

```ruby
begin
  # Get music generation status (alias)
  data, status_code, headers = api_instance.get_music_generation_alias_with_http_info(music_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_music_generation_alias_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **music_id** | **String** |  |  |

### Return type

**Hash&lt;String, Object&gt;**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## get_o_auth_client

> Hash&lt;String, Object&gt; get_o_auth_client(client_id)

Get OAuth client

Returns details for an OAuth client.

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
client_id = 'client_id_example' # String | 

begin
  # Get OAuth client
  result = api_instance.get_o_auth_client(client_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_o_auth_client: #{e}"
end
```

#### Using the get_o_auth_client_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> get_o_auth_client_with_http_info(client_id)

```ruby
begin
  # Get OAuth client
  data, status_code, headers = api_instance.get_o_auth_client_with_http_info(client_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_o_auth_client_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **client_id** | **String** |  |  |

### Return type

**Hash&lt;String, Object&gt;**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## get_provider_derank_status

> Hash&lt;String, Object&gt; get_provider_derank_status(provider_id, opts)

Provider derank status

Returns breaker-based derank/recovery status for a provider.

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
provider_id = 'provider_id_example' # String | Provider identifier.
opts = {
  window_hours: 56, # Integer | Observation window in hours.
  max_pairs: 56, # Integer | Max endpoint/model tuples to inspect.
  fetch_limit: 56 # Integer | Max recent requests to scan.
}

begin
  # Provider derank status
  result = api_instance.get_provider_derank_status(provider_id, opts)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_provider_derank_status: #{e}"
end
```

#### Using the get_provider_derank_status_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> get_provider_derank_status_with_http_info(provider_id, opts)

```ruby
begin
  # Provider derank status
  data, status_code, headers = api_instance.get_provider_derank_status_with_http_info(provider_id, opts)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_provider_derank_status_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **provider_id** | **String** | Provider identifier. |  |
| **window_hours** | **Integer** | Observation window in hours. | [optional] |
| **max_pairs** | **Integer** | Max endpoint/model tuples to inspect. | [optional] |
| **fetch_limit** | **Integer** | Max recent requests to scan. | [optional] |

### Return type

**Hash&lt;String, Object&gt;**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## get_provisioning_key

> <GetProvisioningKey200Response> get_provisioning_key(id)

Get management API key

Returns details of a specific management API key.

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
id = 'id_example' # String | The management API key ID

begin
  # Get management API key
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
  # Get management API key
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
| **id** | **String** | The management API key ID |  |

### Return type

[**GetProvisioningKey200Response**](GetProvisioningKey200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## get_provisioning_key_alias

> Hash&lt;String, Object&gt; get_provisioning_key_alias(id)

Get provisioning key

Alias of management key details endpoint.

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
id = 'id_example' # String | 

begin
  # Get provisioning key
  result = api_instance.get_provisioning_key_alias(id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_provisioning_key_alias: #{e}"
end
```

#### Using the get_provisioning_key_alias_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> get_provisioning_key_alias_with_http_info(id)

```ruby
begin
  # Get provisioning key
  data, status_code, headers = api_instance.get_provisioning_key_alias_with_http_info(id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_provisioning_key_alias_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  |  |

### Return type

**Hash&lt;String, Object&gt;**

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


## get_video_alias

> <VideoGenerationResponse> get_video_alias(video_id)

Get video status (alias)

Alias of /videos/{video_id}.

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
video_id = 'video_id_example' # String | 

begin
  # Get video status (alias)
  result = api_instance.get_video_alias(video_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_video_alias: #{e}"
end
```

#### Using the get_video_alias_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<VideoGenerationResponse>, Integer, Hash)> get_video_alias_with_http_info(video_id)

```ruby
begin
  # Get video status (alias)
  data, status_code, headers = api_instance.get_video_alias_with_http_info(video_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <VideoGenerationResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_video_alias_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **video_id** | **String** |  |  |

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


## get_video_content_alias

> File get_video_content_alias(video_id)

Get video content (alias)

Alias of /videos/{video_id}/content.

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
video_id = 'video_id_example' # String | 

begin
  # Get video content (alias)
  result = api_instance.get_video_content_alias(video_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_video_content_alias: #{e}"
end
```

#### Using the get_video_content_alias_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(File, Integer, Hash)> get_video_content_alias_with_http_info(video_id)

```ruby
begin
  # Get video content (alias)
  data, status_code, headers = api_instance.get_video_content_alias_with_http_info(video_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => File
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->get_video_content_alias_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **video_id** | **String** |  |  |

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


## invalidate_gateway_key_cache

> Hash&lt;String, Object&gt; invalidate_gateway_key_cache(id)

Invalidate key cache

Bumps cache version for key id/kid and invalidates key cache entries.

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
id = 'id_example' # String | Gateway key ID.

begin
  # Invalidate key cache
  result = api_instance.invalidate_gateway_key_cache(id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->invalidate_gateway_key_cache: #{e}"
end
```

#### Using the invalidate_gateway_key_cache_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> invalidate_gateway_key_cache_with_http_info(id)

```ruby
begin
  # Invalidate key cache
  data, status_code, headers = api_instance.invalidate_gateway_key_cache_with_http_info(id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->invalidate_gateway_key_cache_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** | Gateway key ID. |  |

### Return type

**Hash&lt;String, Object&gt;**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## list_endpoints_placeholder

> list_endpoints_placeholder

List endpoints (placeholder)

Placeholder route; currently returns not implemented.

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
  # List endpoints (placeholder)
  api_instance.list_endpoints_placeholder
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_endpoints_placeholder: #{e}"
end
```

#### Using the list_endpoints_placeholder_with_http_info variant

This returns an Array which contains the response data (`nil` in this case), status code and headers.

> <Array(nil, Integer, Hash)> list_endpoints_placeholder_with_http_info

```ruby
begin
  # List endpoints (placeholder)
  data, status_code, headers = api_instance.list_endpoints_placeholder_with_http_info
  p status_code # => 2xx
  p headers # => { ... }
  p data # => nil
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_endpoints_placeholder_with_http_info: #{e}"
end
```

### Parameters

This endpoint does not need any parameter.

### Return type

nil (empty response body)

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


## list_keys_placeholder

> list_keys_placeholder

List keys (placeholder)

Placeholder route; currently returns not implemented.

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
  # List keys (placeholder)
  api_instance.list_keys_placeholder
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_keys_placeholder: #{e}"
end
```

#### Using the list_keys_placeholder_with_http_info variant

This returns an Array which contains the response data (`nil` in this case), status code and headers.

> <Array(nil, Integer, Hash)> list_keys_placeholder_with_http_info

```ruby
begin
  # List keys (placeholder)
  data, status_code, headers = api_instance.list_keys_placeholder_with_http_info
  p status_code # => 2xx
  p headers # => { ... }
  p data # => nil
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_keys_placeholder_with_http_info: #{e}"
end
```

### Parameters

This endpoint does not need any parameter.

### Return type

nil (empty response body)

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


## list_o_auth_clients

> <ListOAuthClients200Response> list_o_auth_clients

List OAuth clients

Lists OAuth clients for the authenticated team.

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
  # List OAuth clients
  result = api_instance.list_o_auth_clients
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_o_auth_clients: #{e}"
end
```

#### Using the list_o_auth_clients_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<ListOAuthClients200Response>, Integer, Hash)> list_o_auth_clients_with_http_info

```ruby
begin
  # List OAuth clients
  data, status_code, headers = api_instance.list_o_auth_clients_with_http_info
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <ListOAuthClients200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_o_auth_clients_with_http_info: #{e}"
end
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**ListOAuthClients200Response**](ListOAuthClients200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## list_organisations

> <ListOrganisations200Response> list_organisations(opts)

List organisations

Returns a list of available organisations.

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
  # List organisations
  result = api_instance.list_organisations(opts)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_organisations: #{e}"
end
```

#### Using the list_organisations_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<ListOrganisations200Response>, Integer, Hash)> list_organisations_with_http_info(opts)

```ruby
begin
  # List organisations
  data, status_code, headers = api_instance.list_organisations_with_http_info(opts)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <ListOrganisations200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_organisations_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **limit** | **Integer** | Limit the number of results | [optional][default to 50] |
| **offset** | **Integer** | Offset for pagination | [optional][default to 0] |

### Return type

[**ListOrganisations200Response**](ListOrganisations200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## list_pricing_models

> <ListPricingModels200Response> list_pricing_models

List pricing models

Returns active provider/model pricing entries.

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
  # List pricing models
  result = api_instance.list_pricing_models
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_pricing_models: #{e}"
end
```

#### Using the list_pricing_models_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<ListPricingModels200Response>, Integer, Hash)> list_pricing_models_with_http_info

```ruby
begin
  # List pricing models
  data, status_code, headers = api_instance.list_pricing_models_with_http_info
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <ListPricingModels200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_pricing_models_with_http_info: #{e}"
end
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**ListPricingModels200Response**](ListPricingModels200Response.md)

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

List management API keys

Returns all management API keys for a team.

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
  # List management API keys
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
  # List management API keys
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


## list_provisioning_keys_alias

> <ListProvisioningKeysAlias200Response> list_provisioning_keys_alias(team_id, opts)

List provisioning keys

Alias of management keys endpoint.

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
  result = api_instance.list_provisioning_keys_alias(team_id, opts)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_provisioning_keys_alias: #{e}"
end
```

#### Using the list_provisioning_keys_alias_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<ListProvisioningKeysAlias200Response>, Integer, Hash)> list_provisioning_keys_alias_with_http_info(team_id, opts)

```ruby
begin
  # List provisioning keys
  data, status_code, headers = api_instance.list_provisioning_keys_alias_with_http_info(team_id, opts)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <ListProvisioningKeysAlias200Response>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->list_provisioning_keys_alias_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **team_id** | **String** | The team ID to query |  |
| **limit** | **Integer** | Maximum number of keys to return | [optional][default to 50] |
| **offset** | **Integer** | Pagination offset | [optional][default to 0] |

### Return type

[**ListProvisioningKeysAlias200Response**](ListProvisioningKeysAlias200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## regenerate_o_auth_client_secret

> Hash&lt;String, Object&gt; regenerate_o_auth_client_secret(client_id)

Regenerate OAuth client secret

Regenerates and returns a new OAuth client secret.

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
client_id = 'client_id_example' # String | 

begin
  # Regenerate OAuth client secret
  result = api_instance.regenerate_o_auth_client_secret(client_id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->regenerate_o_auth_client_secret: #{e}"
end
```

#### Using the regenerate_o_auth_client_secret_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> regenerate_o_auth_client_secret_with_http_info(client_id)

```ruby
begin
  # Regenerate OAuth client secret
  data, status_code, headers = api_instance.regenerate_o_auth_client_secret_with_http_info(client_id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->regenerate_o_auth_client_secret_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **client_id** | **String** |  |  |

### Return type

**Hash&lt;String, Object&gt;**

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


## retrieve_batch_alias

> <BatchResponse> retrieve_batch_alias(id)

Retrieve batch (alias)

Alias of /batches/{batch_id}.

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
id = 'id_example' # String | 

begin
  # Retrieve batch (alias)
  result = api_instance.retrieve_batch_alias(id)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->retrieve_batch_alias: #{e}"
end
```

#### Using the retrieve_batch_alias_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(<BatchResponse>, Integer, Hash)> retrieve_batch_alias_with_http_info(id)

```ruby
begin
  # Retrieve batch (alias)
  data, status_code, headers = api_instance.retrieve_batch_alias_with_http_info(id)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => <BatchResponse>
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->retrieve_batch_alias_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  |  |

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


## update_o_auth_client

> Hash&lt;String, Object&gt; update_o_auth_client(client_id, request_body)

Update OAuth client

Updates OAuth client metadata and redirect URIs.

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
client_id = 'client_id_example' # String | 
request_body = { key: 3.56} # Hash<String, Object> | 

begin
  # Update OAuth client
  result = api_instance.update_o_auth_client(client_id, request_body)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->update_o_auth_client: #{e}"
end
```

#### Using the update_o_auth_client_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> update_o_auth_client_with_http_info(client_id, request_body)

```ruby
begin
  # Update OAuth client
  data, status_code, headers = api_instance.update_o_auth_client_with_http_info(client_id, request_body)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->update_o_auth_client_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **client_id** | **String** |  |  |
| **request_body** | [**Hash&lt;String, Object&gt;**](Object.md) |  |  |

### Return type

**Hash&lt;String, Object&gt;**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


## update_provisioning_key

> <UpdateProvisioningKey200Response> update_provisioning_key(id, update_provisioning_key_request)

Update management API key

Updates the name, status, or blocked state of a management API key.

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
id = 'id_example' # String | The management API key ID
update_provisioning_key_request = AIStatsSdk::UpdateProvisioningKeyRequest.new # UpdateProvisioningKeyRequest | 

begin
  # Update management API key
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
  # Update management API key
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
| **id** | **String** | The management API key ID |  |
| **update_provisioning_key_request** | [**UpdateProvisioningKeyRequest**](UpdateProvisioningKeyRequest.md) |  |  |

### Return type

[**UpdateProvisioningKey200Response**](UpdateProvisioningKey200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


## update_provisioning_key_alias

> Hash&lt;String, Object&gt; update_provisioning_key_alias(id, request_body)

Update provisioning key

Alias of management key update endpoint.

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
id = 'id_example' # String | 
request_body = { key: 3.56} # Hash<String, Object> | 

begin
  # Update provisioning key
  result = api_instance.update_provisioning_key_alias(id, request_body)
  p result
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->update_provisioning_key_alias: #{e}"
end
```

#### Using the update_provisioning_key_alias_with_http_info variant

This returns an Array which contains the response data, status code and headers.

> <Array(Hash&lt;String, Object&gt;, Integer, Hash)> update_provisioning_key_alias_with_http_info(id, request_body)

```ruby
begin
  # Update provisioning key
  data, status_code, headers = api_instance.update_provisioning_key_alias_with_http_info(id, request_body)
  p status_code # => 2xx
  p headers # => { ... }
  p data # => Hash&lt;String, Object&gt;
rescue AIStatsSdk::ApiError => e
  puts "Error when calling DefaultApi->update_provisioning_key_alias_with_http_info: #{e}"
end
```

### Parameters

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  |  |
| **request_body** | [**Hash&lt;String, Object&gt;**](Object.md) |  |  |

### Return type

**Hash&lt;String, Object&gt;**

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

