# BatchRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**InputFileId** | **string** |  | 
**Endpoint** | **string** |  | 
**CompletionWindow** | Pointer to **string** |  | [optional] 
**Metadata** | Pointer to **map[string]interface{}** |  | [optional] 
**Debug** | Pointer to [**DebugOptions**](DebugOptions.md) |  | [optional] 
**Provider** | Pointer to [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 

## Methods

### NewBatchRequest

`func NewBatchRequest(inputFileId string, endpoint string, ) *BatchRequest`

NewBatchRequest instantiates a new BatchRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewBatchRequestWithDefaults

`func NewBatchRequestWithDefaults() *BatchRequest`

NewBatchRequestWithDefaults instantiates a new BatchRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetInputFileId

`func (o *BatchRequest) GetInputFileId() string`

GetInputFileId returns the InputFileId field if non-nil, zero value otherwise.

### GetInputFileIdOk

`func (o *BatchRequest) GetInputFileIdOk() (*string, bool)`

GetInputFileIdOk returns a tuple with the InputFileId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputFileId

`func (o *BatchRequest) SetInputFileId(v string)`

SetInputFileId sets InputFileId field to given value.


### GetEndpoint

`func (o *BatchRequest) GetEndpoint() string`

GetEndpoint returns the Endpoint field if non-nil, zero value otherwise.

### GetEndpointOk

`func (o *BatchRequest) GetEndpointOk() (*string, bool)`

GetEndpointOk returns a tuple with the Endpoint field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEndpoint

`func (o *BatchRequest) SetEndpoint(v string)`

SetEndpoint sets Endpoint field to given value.


### GetCompletionWindow

`func (o *BatchRequest) GetCompletionWindow() string`

GetCompletionWindow returns the CompletionWindow field if non-nil, zero value otherwise.

### GetCompletionWindowOk

`func (o *BatchRequest) GetCompletionWindowOk() (*string, bool)`

GetCompletionWindowOk returns a tuple with the CompletionWindow field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCompletionWindow

`func (o *BatchRequest) SetCompletionWindow(v string)`

SetCompletionWindow sets CompletionWindow field to given value.

### HasCompletionWindow

`func (o *BatchRequest) HasCompletionWindow() bool`

HasCompletionWindow returns a boolean if a field has been set.

### GetMetadata

`func (o *BatchRequest) GetMetadata() map[string]interface{}`

GetMetadata returns the Metadata field if non-nil, zero value otherwise.

### GetMetadataOk

`func (o *BatchRequest) GetMetadataOk() (*map[string]interface{}, bool)`

GetMetadataOk returns a tuple with the Metadata field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMetadata

`func (o *BatchRequest) SetMetadata(v map[string]interface{})`

SetMetadata sets Metadata field to given value.

### HasMetadata

`func (o *BatchRequest) HasMetadata() bool`

HasMetadata returns a boolean if a field has been set.

### GetDebug

`func (o *BatchRequest) GetDebug() DebugOptions`

GetDebug returns the Debug field if non-nil, zero value otherwise.

### GetDebugOk

`func (o *BatchRequest) GetDebugOk() (*DebugOptions, bool)`

GetDebugOk returns a tuple with the Debug field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDebug

`func (o *BatchRequest) SetDebug(v DebugOptions)`

SetDebug sets Debug field to given value.

### HasDebug

`func (o *BatchRequest) HasDebug() bool`

HasDebug returns a boolean if a field has been set.

### GetProvider

`func (o *BatchRequest) GetProvider() ProviderRoutingOptions`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *BatchRequest) GetProviderOk() (*ProviderRoutingOptions, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *BatchRequest) SetProvider(v ProviderRoutingOptions)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *BatchRequest) HasProvider() bool`

HasProvider returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


