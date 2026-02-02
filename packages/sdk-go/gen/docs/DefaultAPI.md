# \DefaultAPI

All URIs are relative to *https://gateway.ai-stats.com/v1*

Method | HTTP request | Description
------------- | ------------- | -------------
[**CreateAnthropicMessage**](DefaultAPI.md#CreateAnthropicMessage) | **Post** /messages | Create message
[**CreateBatch**](DefaultAPI.md#CreateBatch) | **Post** /batches | Create batch
[**CreateChatCompletion**](DefaultAPI.md#CreateChatCompletion) | **Post** /chat/completions | Create chat completion
[**CreateEmbedding**](DefaultAPI.md#CreateEmbedding) | **Post** /embeddings | Create embeddings
[**CreateImage**](DefaultAPI.md#CreateImage) | **Post** /images/generations | Create image
[**CreateImageEdit**](DefaultAPI.md#CreateImageEdit) | **Post** /images/edits | Create image edit
[**CreateModeration**](DefaultAPI.md#CreateModeration) | **Post** /moderations | Create moderation
[**CreateOcr**](DefaultAPI.md#CreateOcr) | **Post** /ocr | Create OCR
[**CreateProvisioningKey**](DefaultAPI.md#CreateProvisioningKey) | **Post** /provisioning/keys | Create provisioning key
[**CreateResponse**](DefaultAPI.md#CreateResponse) | **Post** /responses | Create response
[**CreateSpeech**](DefaultAPI.md#CreateSpeech) | **Post** /audio/speech | Generate speech
[**CreateTranscription**](DefaultAPI.md#CreateTranscription) | **Post** /audio/transcriptions | Create transcription
[**CreateTranslation**](DefaultAPI.md#CreateTranslation) | **Post** /audio/translations | Create translation
[**CreateVideo**](DefaultAPI.md#CreateVideo) | **Post** /videos | Create video
[**DeleteProvisioningKey**](DefaultAPI.md#DeleteProvisioningKey) | **Delete** /provisioning/keys/{id} | Delete provisioning key
[**DeleteVideo**](DefaultAPI.md#DeleteVideo) | **Delete** /videos/{video_id} | Delete video
[**GenerateMusic**](DefaultAPI.md#GenerateMusic) | **Post** /music/generate | Generate music
[**GetActivity**](DefaultAPI.md#GetActivity) | **Get** /activity | Get activity
[**GetAnalytics**](DefaultAPI.md#GetAnalytics) | **Post** /analytics | Get analytics
[**GetCredits**](DefaultAPI.md#GetCredits) | **Get** /credits | Get remaining credits
[**GetGeneration**](DefaultAPI.md#GetGeneration) | **Get** /generation | Get generation
[**GetProvisioningKey**](DefaultAPI.md#GetProvisioningKey) | **Get** /provisioning/keys/{id} | Get provisioning key
[**GetVideo**](DefaultAPI.md#GetVideo) | **Get** /videos/{video_id} | Get video status
[**GetVideoContent**](DefaultAPI.md#GetVideoContent) | **Get** /videos/{video_id}/content | Get video content
[**Healthz**](DefaultAPI.md#Healthz) | **Get** /healthz | Health check
[**ListFiles**](DefaultAPI.md#ListFiles) | **Get** /files | List files
[**ListModels**](DefaultAPI.md#ListModels) | **Get** /models | List models
[**ListProviders**](DefaultAPI.md#ListProviders) | **Get** /providers | List providers
[**ListProvisioningKeys**](DefaultAPI.md#ListProvisioningKeys) | **Get** /provisioning/keys | List provisioning keys
[**RetrieveBatch**](DefaultAPI.md#RetrieveBatch) | **Get** /batches/{batch_id} | Retrieve batch
[**RetrieveFile**](DefaultAPI.md#RetrieveFile) | **Get** /files/{file_id} | Retrieve file
[**Root**](DefaultAPI.md#Root) | **Get** / | Root endpoint
[**UpdateProvisioningKey**](DefaultAPI.md#UpdateProvisioningKey) | **Patch** /provisioning/keys/{id} | Update provisioning key
[**UploadFile**](DefaultAPI.md#UploadFile) | **Post** /files | Upload file



## CreateAnthropicMessage

> AnthropicMessagesResponse CreateAnthropicMessage(ctx).AnthropicMessagesRequest(anthropicMessagesRequest).Execute()

Create message



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	anthropicMessagesRequest := *openapiclient.NewAnthropicMessagesRequest("Model_example", []openapiclient.AnthropicMessage{*openapiclient.NewAnthropicMessage("Role_example", openapiclient.AnthropicMessage_content{ArrayOfAnthropicContentBlock: new([]AnthropicContentBlock)})}) // AnthropicMessagesRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateAnthropicMessage(context.Background()).AnthropicMessagesRequest(anthropicMessagesRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateAnthropicMessage``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateAnthropicMessage`: AnthropicMessagesResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateAnthropicMessage`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateAnthropicMessageRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **anthropicMessagesRequest** | [**AnthropicMessagesRequest**](AnthropicMessagesRequest.md) |  | 

### Return type

[**AnthropicMessagesResponse**](AnthropicMessagesResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json, text/event-stream

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## CreateBatch

> BatchResponse CreateBatch(ctx).BatchRequest(batchRequest).Execute()

Create batch



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	batchRequest := *openapiclient.NewBatchRequest("InputFileId_example", "Endpoint_example") // BatchRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateBatch(context.Background()).BatchRequest(batchRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateBatch``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateBatch`: BatchResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateBatch`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateBatchRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **batchRequest** | [**BatchRequest**](BatchRequest.md) |  | 

### Return type

[**BatchResponse**](BatchResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## CreateChatCompletion

> ChatCompletionsResponse CreateChatCompletion(ctx).ChatCompletionsRequest(chatCompletionsRequest).Execute()

Create chat completion



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	chatCompletionsRequest := *openapiclient.NewChatCompletionsRequest("Model_example", []openapiclient.ChatMessage{*openapiclient.NewChatMessage("Role_example")}) // ChatCompletionsRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateChatCompletion(context.Background()).ChatCompletionsRequest(chatCompletionsRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateChatCompletion``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateChatCompletion`: ChatCompletionsResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateChatCompletion`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateChatCompletionRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **chatCompletionsRequest** | [**ChatCompletionsRequest**](ChatCompletionsRequest.md) |  | 

### Return type

[**ChatCompletionsResponse**](ChatCompletionsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## CreateEmbedding

> EmbeddingsResponse CreateEmbedding(ctx).EmbeddingsRequest(embeddingsRequest).Execute()

Create embeddings



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	embeddingsRequest := *openapiclient.NewEmbeddingsRequest() // EmbeddingsRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateEmbedding(context.Background()).EmbeddingsRequest(embeddingsRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateEmbedding``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateEmbedding`: EmbeddingsResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateEmbedding`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateEmbeddingRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **embeddingsRequest** | [**EmbeddingsRequest**](EmbeddingsRequest.md) |  | 

### Return type

[**EmbeddingsResponse**](EmbeddingsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## CreateImage

> ImagesGenerationResponse CreateImage(ctx).ImagesGenerationRequest(imagesGenerationRequest).Execute()

Create image



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	imagesGenerationRequest := *openapiclient.NewImagesGenerationRequest("Model_example", "Prompt_example") // ImagesGenerationRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateImage(context.Background()).ImagesGenerationRequest(imagesGenerationRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateImage``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateImage`: ImagesGenerationResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateImage`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateImageRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **imagesGenerationRequest** | [**ImagesGenerationRequest**](ImagesGenerationRequest.md) |  | 

### Return type

[**ImagesGenerationResponse**](ImagesGenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## CreateImageEdit

> ImagesEditResponse CreateImageEdit(ctx).Model(model).Image(image).Prompt(prompt).Mask(mask).Size(size).N(n).User(user).Meta(meta).Usage(usage).Provider(provider).Execute()

Create image edit



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	model := "model_example" // string | 
	image := "image_example" // string | 
	prompt := "prompt_example" // string | 
	mask := "mask_example" // string |  (optional)
	size := "size_example" // string |  (optional)
	n := int32(56) // int32 |  (optional)
	user := "user_example" // string |  (optional)
	meta := true // bool |  (optional)
	usage := true // bool |  (optional)
	provider := *openapiclient.NewProviderRoutingOptions() // ProviderRoutingOptions |  (optional)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateImageEdit(context.Background()).Model(model).Image(image).Prompt(prompt).Mask(mask).Size(size).N(n).User(user).Meta(meta).Usage(usage).Provider(provider).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateImageEdit``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateImageEdit`: ImagesEditResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateImageEdit`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateImageEditRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **model** | **string** |  | 
 **image** | **string** |  | 
 **prompt** | **string** |  | 
 **mask** | **string** |  | 
 **size** | **string** |  | 
 **n** | **int32** |  | 
 **user** | **string** |  | 
 **meta** | **bool** |  | 
 **usage** | **bool** |  | 
 **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | 

### Return type

[**ImagesEditResponse**](ImagesEditResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: multipart/form-data
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## CreateModeration

> ModerationsResponse CreateModeration(ctx).ModerationsRequest(moderationsRequest).Execute()

Create moderation



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	moderationsRequest := *openapiclient.NewModerationsRequest("Model_example", openapiclient.ModerationsRequest_input{ArrayOfModerationsRequestInputOneOfInner: new([]ModerationsRequestInputOneOfInner)}) // ModerationsRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateModeration(context.Background()).ModerationsRequest(moderationsRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateModeration``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateModeration`: ModerationsResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateModeration`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateModerationRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **moderationsRequest** | [**ModerationsRequest**](ModerationsRequest.md) |  | 

### Return type

[**ModerationsResponse**](ModerationsResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## CreateOcr

> map[string]interface{} CreateOcr(ctx).OcrRequest(ocrRequest).Execute()

Create OCR



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	ocrRequest := *openapiclient.NewOcrRequest("Model_example", "Image_example") // OcrRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateOcr(context.Background()).OcrRequest(ocrRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateOcr``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateOcr`: map[string]interface{}
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateOcr`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateOcrRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **ocrRequest** | [**OcrRequest**](OcrRequest.md) |  | 

### Return type

**map[string]interface{}**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## CreateProvisioningKey

> CreateProvisioningKey201Response CreateProvisioningKey(ctx).CreateProvisioningKeyRequest(createProvisioningKeyRequest).Execute()

Create provisioning key



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	createProvisioningKeyRequest := *openapiclient.NewCreateProvisioningKeyRequest("TeamId_example", "Name_example", "CreatedBy_example") // CreateProvisioningKeyRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateProvisioningKey(context.Background()).CreateProvisioningKeyRequest(createProvisioningKeyRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateProvisioningKey``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateProvisioningKey`: CreateProvisioningKey201Response
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateProvisioningKey`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateProvisioningKeyRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **createProvisioningKeyRequest** | [**CreateProvisioningKeyRequest**](CreateProvisioningKeyRequest.md) |  | 

### Return type

[**CreateProvisioningKey201Response**](CreateProvisioningKey201Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## CreateResponse

> ResponsesResponse CreateResponse(ctx).ResponsesRequest(responsesRequest).Execute()

Create response



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	responsesRequest := *openapiclient.NewResponsesRequest("Model_example") // ResponsesRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateResponse(context.Background()).ResponsesRequest(responsesRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateResponse``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateResponse`: ResponsesResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateResponse`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateResponseRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **responsesRequest** | [**ResponsesRequest**](ResponsesRequest.md) |  | 

### Return type

[**ResponsesResponse**](ResponsesResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## CreateSpeech

> *os.File CreateSpeech(ctx).AudioSpeechRequest(audioSpeechRequest).Execute()

Generate speech



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	audioSpeechRequest := *openapiclient.NewAudioSpeechRequest("Model_example", "Input_example") // AudioSpeechRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateSpeech(context.Background()).AudioSpeechRequest(audioSpeechRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateSpeech``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateSpeech`: *os.File
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateSpeech`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateSpeechRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **audioSpeechRequest** | [**AudioSpeechRequest**](AudioSpeechRequest.md) |  | 

### Return type

[***os.File**](*os.File.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: audio/mpeg

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## CreateTranscription

> AudioTranscriptionResponse CreateTranscription(ctx).Model(model).AudioUrl(audioUrl).AudioB64(audioB64).Language(language).Provider(provider).Execute()

Create transcription



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	model := "model_example" // string | 
	audioUrl := "audioUrl_example" // string |  (optional)
	audioB64 := "audioB64_example" // string |  (optional)
	language := "language_example" // string |  (optional)
	provider := *openapiclient.NewProviderRoutingOptions() // ProviderRoutingOptions |  (optional)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateTranscription(context.Background()).Model(model).AudioUrl(audioUrl).AudioB64(audioB64).Language(language).Provider(provider).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateTranscription``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateTranscription`: AudioTranscriptionResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateTranscription`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateTranscriptionRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **model** | **string** |  | 
 **audioUrl** | **string** |  | 
 **audioB64** | **string** |  | 
 **language** | **string** |  | 
 **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | 

### Return type

[**AudioTranscriptionResponse**](AudioTranscriptionResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: multipart/form-data
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## CreateTranslation

> AudioTranslationResponse CreateTranslation(ctx).Model(model).AudioUrl(audioUrl).AudioB64(audioB64).Language(language).Prompt(prompt).Temperature(temperature).Provider(provider).Execute()

Create translation



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	model := "model_example" // string | 
	audioUrl := "audioUrl_example" // string |  (optional)
	audioB64 := "audioB64_example" // string |  (optional)
	language := "language_example" // string |  (optional)
	prompt := "prompt_example" // string |  (optional)
	temperature := float32(8.14) // float32 |  (optional)
	provider := *openapiclient.NewProviderRoutingOptions() // ProviderRoutingOptions |  (optional)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateTranslation(context.Background()).Model(model).AudioUrl(audioUrl).AudioB64(audioB64).Language(language).Prompt(prompt).Temperature(temperature).Provider(provider).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateTranslation``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateTranslation`: AudioTranslationResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateTranslation`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateTranslationRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **model** | **string** |  | 
 **audioUrl** | **string** |  | 
 **audioB64** | **string** |  | 
 **language** | **string** |  | 
 **prompt** | **string** |  | 
 **temperature** | **float32** |  | 
 **provider** | [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | 

### Return type

[**AudioTranslationResponse**](AudioTranslationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: multipart/form-data
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## CreateVideo

> VideoGenerationResponse CreateVideo(ctx).VideoGenerationRequest(videoGenerationRequest).Execute()

Create video



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	videoGenerationRequest := *openapiclient.NewVideoGenerationRequest("Model_example", "Prompt_example") // VideoGenerationRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.CreateVideo(context.Background()).VideoGenerationRequest(videoGenerationRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.CreateVideo``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `CreateVideo`: VideoGenerationResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.CreateVideo`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiCreateVideoRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **videoGenerationRequest** | [**VideoGenerationRequest**](VideoGenerationRequest.md) |  | 

### Return type

[**VideoGenerationResponse**](VideoGenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## DeleteProvisioningKey

> DeleteProvisioningKey200Response DeleteProvisioningKey(ctx, id).Execute()

Delete provisioning key



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	id := "id_example" // string | The provisioning key ID

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.DeleteProvisioningKey(context.Background(), id).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.DeleteProvisioningKey``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `DeleteProvisioningKey`: DeleteProvisioningKey200Response
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.DeleteProvisioningKey`: %v\n", resp)
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**id** | **string** | The provisioning key ID | 

### Other Parameters

Other parameters are passed through a pointer to a apiDeleteProvisioningKeyRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


### Return type

[**DeleteProvisioningKey200Response**](DeleteProvisioningKey200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## DeleteVideo

> VideoDeleteResponse DeleteVideo(ctx, videoId).Execute()

Delete video



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	videoId := "videoId_example" // string | The ID of the video generation request.

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.DeleteVideo(context.Background(), videoId).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.DeleteVideo``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `DeleteVideo`: VideoDeleteResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.DeleteVideo`: %v\n", resp)
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**videoId** | **string** | The ID of the video generation request. | 

### Other Parameters

Other parameters are passed through a pointer to a apiDeleteVideoRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


### Return type

[**VideoDeleteResponse**](VideoDeleteResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## GenerateMusic

> map[string]interface{} GenerateMusic(ctx).MusicGenerateRequest(musicGenerateRequest).Execute()

Generate music



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	musicGenerateRequest := *openapiclient.NewMusicGenerateRequest("Model_example") // MusicGenerateRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.GenerateMusic(context.Background()).MusicGenerateRequest(musicGenerateRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.GenerateMusic``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `GenerateMusic`: map[string]interface{}
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.GenerateMusic`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiGenerateMusicRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **musicGenerateRequest** | [**MusicGenerateRequest**](MusicGenerateRequest.md) |  | 

### Return type

**map[string]interface{}**

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## GetActivity

> GetActivity200Response GetActivity(ctx).TeamId(teamId).Days(days).Limit(limit).Offset(offset).Execute()

Get activity



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	teamId := "teamId_example" // string | The team ID to query
	days := int32(56) // int32 | Number of days to look back (optional) (default to 30)
	limit := int32(56) // int32 | Maximum number of records to return (optional) (default to 50)
	offset := int32(56) // int32 | Pagination offset (optional) (default to 0)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.GetActivity(context.Background()).TeamId(teamId).Days(days).Limit(limit).Offset(offset).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.GetActivity``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `GetActivity`: GetActivity200Response
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.GetActivity`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiGetActivityRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **teamId** | **string** | The team ID to query | 
 **days** | **int32** | Number of days to look back | [default to 30]
 **limit** | **int32** | Maximum number of records to return | [default to 50]
 **offset** | **int32** | Pagination offset | [default to 0]

### Return type

[**GetActivity200Response**](GetActivity200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## GetAnalytics

> GetAnalytics200Response GetAnalytics(ctx).GetAnalyticsRequest(getAnalyticsRequest).Execute()

Get analytics



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	getAnalyticsRequest := *openapiclient.NewGetAnalyticsRequest() // GetAnalyticsRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.GetAnalytics(context.Background()).GetAnalyticsRequest(getAnalyticsRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.GetAnalytics``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `GetAnalytics`: GetAnalytics200Response
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.GetAnalytics`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiGetAnalyticsRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **getAnalyticsRequest** | [**GetAnalyticsRequest**](GetAnalyticsRequest.md) |  | 

### Return type

[**GetAnalytics200Response**](GetAnalytics200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## GetCredits

> GetCredits200Response GetCredits(ctx).TeamId(teamId).Execute()

Get remaining credits



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	teamId := "teamId_example" // string | The team ID to query

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.GetCredits(context.Background()).TeamId(teamId).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.GetCredits``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `GetCredits`: GetCredits200Response
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.GetCredits`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiGetCreditsRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **teamId** | **string** | The team ID to query | 

### Return type

[**GetCredits200Response**](GetCredits200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## GetGeneration

> GenerationResponse GetGeneration(ctx).Id(id).Execute()

Get generation



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	id := "id_example" // string | The ID of the generation

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.GetGeneration(context.Background()).Id(id).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.GetGeneration``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `GetGeneration`: GenerationResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.GetGeneration`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiGetGenerationRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **string** | The ID of the generation | 

### Return type

[**GenerationResponse**](GenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## GetProvisioningKey

> GetProvisioningKey200Response GetProvisioningKey(ctx, id).Execute()

Get provisioning key



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	id := "id_example" // string | The provisioning key ID

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.GetProvisioningKey(context.Background(), id).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.GetProvisioningKey``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `GetProvisioningKey`: GetProvisioningKey200Response
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.GetProvisioningKey`: %v\n", resp)
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**id** | **string** | The provisioning key ID | 

### Other Parameters

Other parameters are passed through a pointer to a apiGetProvisioningKeyRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


### Return type

[**GetProvisioningKey200Response**](GetProvisioningKey200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## GetVideo

> VideoGenerationResponse GetVideo(ctx, videoId).Execute()

Get video status



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	videoId := "videoId_example" // string | The ID of the video generation request.

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.GetVideo(context.Background(), videoId).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.GetVideo``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `GetVideo`: VideoGenerationResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.GetVideo`: %v\n", resp)
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**videoId** | **string** | The ID of the video generation request. | 

### Other Parameters

Other parameters are passed through a pointer to a apiGetVideoRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


### Return type

[**VideoGenerationResponse**](VideoGenerationResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## GetVideoContent

> *os.File GetVideoContent(ctx, videoId).Execute()

Get video content



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	videoId := "videoId_example" // string | The ID of the video generation request.

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.GetVideoContent(context.Background(), videoId).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.GetVideoContent``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `GetVideoContent`: *os.File
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.GetVideoContent`: %v\n", resp)
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**videoId** | **string** | The ID of the video generation request. | 

### Other Parameters

Other parameters are passed through a pointer to a apiGetVideoContentRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


### Return type

[***os.File**](*os.File.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/octet-stream

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## Healthz

> Healthz200Response Healthz(ctx).Execute()

Health check



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.Healthz(context.Background()).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.Healthz``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `Healthz`: Healthz200Response
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.Healthz`: %v\n", resp)
}
```

### Path Parameters

This endpoint does not need any parameter.

### Other Parameters

Other parameters are passed through a pointer to a apiHealthzRequest struct via the builder pattern


### Return type

[**Healthz200Response**](Healthz200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## ListFiles

> ListFilesResponse ListFiles(ctx).Execute()

List files



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.ListFiles(context.Background()).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.ListFiles``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `ListFiles`: ListFilesResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.ListFiles`: %v\n", resp)
}
```

### Path Parameters

This endpoint does not need any parameter.

### Other Parameters

Other parameters are passed through a pointer to a apiListFilesRequest struct via the builder pattern


### Return type

[**ListFilesResponse**](ListFilesResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## ListModels

> ListModels200Response ListModels(ctx).Endpoints(endpoints).Organisation(organisation).InputTypes(inputTypes).OutputTypes(outputTypes).Params(params).Limit(limit).Offset(offset).Execute()

List models



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	endpoints := []string{"Inner_example"} // []string | Filter by endpoints (optional)
	organisation := openapiclient.listModels_organisation_parameter{OrganisationId: openapiclient.OrganisationId("ai21")} // ListModelsOrganisationParameter | Filter by organisation (optional)
	inputTypes := []string{"Inner_example"} // []string | Filter by input types (optional)
	outputTypes := []string{"Inner_example"} // []string | Filter by output types (optional)
	params := []string{"Inner_example"} // []string | Filter by params (optional)
	limit := int32(56) // int32 | Limit the number of results (optional) (default to 50)
	offset := int32(56) // int32 | Offset for pagination (optional) (default to 0)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.ListModels(context.Background()).Endpoints(endpoints).Organisation(organisation).InputTypes(inputTypes).OutputTypes(outputTypes).Params(params).Limit(limit).Offset(offset).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.ListModels``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `ListModels`: ListModels200Response
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.ListModels`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiListModelsRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **endpoints** | **[]string** | Filter by endpoints | 
 **organisation** | [**ListModelsOrganisationParameter**](ListModelsOrganisationParameter.md) | Filter by organisation | 
 **inputTypes** | **[]string** | Filter by input types | 
 **outputTypes** | **[]string** | Filter by output types | 
 **params** | **[]string** | Filter by params | 
 **limit** | **int32** | Limit the number of results | [default to 50]
 **offset** | **int32** | Offset for pagination | [default to 0]

### Return type

[**ListModels200Response**](ListModels200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## ListProviders

> ListProviders200Response ListProviders(ctx).Limit(limit).Offset(offset).Execute()

List providers



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	limit := int32(56) // int32 | Limit the number of results (optional) (default to 50)
	offset := int32(56) // int32 | Offset for pagination (optional) (default to 0)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.ListProviders(context.Background()).Limit(limit).Offset(offset).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.ListProviders``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `ListProviders`: ListProviders200Response
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.ListProviders`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiListProvidersRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **limit** | **int32** | Limit the number of results | [default to 50]
 **offset** | **int32** | Offset for pagination | [default to 0]

### Return type

[**ListProviders200Response**](ListProviders200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## ListProvisioningKeys

> ListProvisioningKeys200Response ListProvisioningKeys(ctx).TeamId(teamId).Limit(limit).Offset(offset).Execute()

List provisioning keys



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	teamId := "teamId_example" // string | The team ID to query
	limit := int32(56) // int32 | Maximum number of keys to return (optional) (default to 50)
	offset := int32(56) // int32 | Pagination offset (optional) (default to 0)

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.ListProvisioningKeys(context.Background()).TeamId(teamId).Limit(limit).Offset(offset).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.ListProvisioningKeys``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `ListProvisioningKeys`: ListProvisioningKeys200Response
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.ListProvisioningKeys`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiListProvisioningKeysRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **teamId** | **string** | The team ID to query | 
 **limit** | **int32** | Maximum number of keys to return | [default to 50]
 **offset** | **int32** | Pagination offset | [default to 0]

### Return type

[**ListProvisioningKeys200Response**](ListProvisioningKeys200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## RetrieveBatch

> BatchResponse RetrieveBatch(ctx, batchId).Execute()

Retrieve batch



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	batchId := "batchId_example" // string | The ID of the batch to retrieve.

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.RetrieveBatch(context.Background(), batchId).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.RetrieveBatch``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `RetrieveBatch`: BatchResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.RetrieveBatch`: %v\n", resp)
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**batchId** | **string** | The ID of the batch to retrieve. | 

### Other Parameters

Other parameters are passed through a pointer to a apiRetrieveBatchRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


### Return type

[**BatchResponse**](BatchResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## RetrieveFile

> FileResponse RetrieveFile(ctx, fileId).Execute()

Retrieve file



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	fileId := "fileId_example" // string | The ID of the file to retrieve.

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.RetrieveFile(context.Background(), fileId).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.RetrieveFile``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `RetrieveFile`: FileResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.RetrieveFile`: %v\n", resp)
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**fileId** | **string** | The ID of the file to retrieve. | 

### Other Parameters

Other parameters are passed through a pointer to a apiRetrieveFileRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------


### Return type

[**FileResponse**](FileResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## Root

> Root200Response Root(ctx).Execute()

Root endpoint



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.Root(context.Background()).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.Root``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `Root`: Root200Response
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.Root`: %v\n", resp)
}
```

### Path Parameters

This endpoint does not need any parameter.

### Other Parameters

Other parameters are passed through a pointer to a apiRootRequest struct via the builder pattern


### Return type

[**Root200Response**](Root200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## UpdateProvisioningKey

> UpdateProvisioningKey200Response UpdateProvisioningKey(ctx, id).UpdateProvisioningKeyRequest(updateProvisioningKeyRequest).Execute()

Update provisioning key



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	id := "id_example" // string | The provisioning key ID
	updateProvisioningKeyRequest := *openapiclient.NewUpdateProvisioningKeyRequest() // UpdateProvisioningKeyRequest | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.UpdateProvisioningKey(context.Background(), id).UpdateProvisioningKeyRequest(updateProvisioningKeyRequest).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.UpdateProvisioningKey``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `UpdateProvisioningKey`: UpdateProvisioningKey200Response
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.UpdateProvisioningKey`: %v\n", resp)
}
```

### Path Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
**ctx** | **context.Context** | context for authentication, logging, cancellation, deadlines, tracing, etc.
**id** | **string** | The provisioning key ID | 

### Other Parameters

Other parameters are passed through a pointer to a apiUpdateProvisioningKeyRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------

 **updateProvisioningKeyRequest** | [**UpdateProvisioningKeyRequest**](UpdateProvisioningKeyRequest.md) |  | 

### Return type

[**UpdateProvisioningKey200Response**](UpdateProvisioningKey200Response.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)


## UploadFile

> FileResponse UploadFile(ctx).File(file).Purpose(purpose).Execute()

Upload file



### Example

```go
package main

import (
	"context"
	"fmt"
	"os"
	openapiclient "github.com/GIT_USER_ID/GIT_REPO_ID"
)

func main() {
	file := os.NewFile(1234, "some_file") // *os.File | 
	purpose := "purpose_example" // string | 

	configuration := openapiclient.NewConfiguration()
	apiClient := openapiclient.NewAPIClient(configuration)
	resp, r, err := apiClient.DefaultAPI.UploadFile(context.Background()).File(file).Purpose(purpose).Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error when calling `DefaultAPI.UploadFile``: %v\n", err)
		fmt.Fprintf(os.Stderr, "Full HTTP response: %v\n", r)
	}
	// response from `UploadFile`: FileResponse
	fmt.Fprintf(os.Stdout, "Response from `DefaultAPI.UploadFile`: %v\n", resp)
}
```

### Path Parameters



### Other Parameters

Other parameters are passed through a pointer to a apiUploadFileRequest struct via the builder pattern


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **file** | ***os.File** |  | 
 **purpose** | **string** |  | 

### Return type

[**FileResponse**](FileResponse.md)

### Authorization

[BearerAuth](../README.md#BearerAuth)

### HTTP request headers

- **Content-Type**: multipart/form-data
- **Accept**: application/json

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints)
[[Back to Model list]](../README.md#documentation-for-models)
[[Back to README]](../README.md)

