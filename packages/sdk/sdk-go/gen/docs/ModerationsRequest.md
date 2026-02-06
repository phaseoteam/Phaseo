# ModerationsRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**Meta** | Pointer to **bool** |  | [optional] [default to false]
**Debug** | Pointer to [**DebugOptions**](DebugOptions.md) |  | [optional] 
**Input** | [**ModerationsRequestInput**](ModerationsRequestInput.md) |  | 
**Provider** | Pointer to [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 

## Methods

### NewModerationsRequest

`func NewModerationsRequest(model string, input ModerationsRequestInput, ) *ModerationsRequest`

NewModerationsRequest instantiates a new ModerationsRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewModerationsRequestWithDefaults

`func NewModerationsRequestWithDefaults() *ModerationsRequest`

NewModerationsRequestWithDefaults instantiates a new ModerationsRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetModel

`func (o *ModerationsRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *ModerationsRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *ModerationsRequest) SetModel(v string)`

SetModel sets Model field to given value.


### GetMeta

`func (o *ModerationsRequest) GetMeta() bool`

GetMeta returns the Meta field if non-nil, zero value otherwise.

### GetMetaOk

`func (o *ModerationsRequest) GetMetaOk() (*bool, bool)`

GetMetaOk returns a tuple with the Meta field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMeta

`func (o *ModerationsRequest) SetMeta(v bool)`

SetMeta sets Meta field to given value.

### HasMeta

`func (o *ModerationsRequest) HasMeta() bool`

HasMeta returns a boolean if a field has been set.

### GetDebug

`func (o *ModerationsRequest) GetDebug() DebugOptions`

GetDebug returns the Debug field if non-nil, zero value otherwise.

### GetDebugOk

`func (o *ModerationsRequest) GetDebugOk() (*DebugOptions, bool)`

GetDebugOk returns a tuple with the Debug field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDebug

`func (o *ModerationsRequest) SetDebug(v DebugOptions)`

SetDebug sets Debug field to given value.

### HasDebug

`func (o *ModerationsRequest) HasDebug() bool`

HasDebug returns a boolean if a field has been set.

### GetInput

`func (o *ModerationsRequest) GetInput() ModerationsRequestInput`

GetInput returns the Input field if non-nil, zero value otherwise.

### GetInputOk

`func (o *ModerationsRequest) GetInputOk() (*ModerationsRequestInput, bool)`

GetInputOk returns a tuple with the Input field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInput

`func (o *ModerationsRequest) SetInput(v ModerationsRequestInput)`

SetInput sets Input field to given value.


### GetProvider

`func (o *ModerationsRequest) GetProvider() ProviderRoutingOptions`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *ModerationsRequest) GetProviderOk() (*ProviderRoutingOptions, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *ModerationsRequest) SetProvider(v ProviderRoutingOptions)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *ModerationsRequest) HasProvider() bool`

HasProvider returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


