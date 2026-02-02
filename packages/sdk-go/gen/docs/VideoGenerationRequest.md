# VideoGenerationRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**Prompt** | **string** |  | 
**Duration** | Pointer to **int32** |  | [optional] 
**Ratio** | Pointer to **string** |  | [optional] 
**Provider** | Pointer to [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 

## Methods

### NewVideoGenerationRequest

`func NewVideoGenerationRequest(model string, prompt string, ) *VideoGenerationRequest`

NewVideoGenerationRequest instantiates a new VideoGenerationRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewVideoGenerationRequestWithDefaults

`func NewVideoGenerationRequestWithDefaults() *VideoGenerationRequest`

NewVideoGenerationRequestWithDefaults instantiates a new VideoGenerationRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetModel

`func (o *VideoGenerationRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *VideoGenerationRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *VideoGenerationRequest) SetModel(v string)`

SetModel sets Model field to given value.


### GetPrompt

`func (o *VideoGenerationRequest) GetPrompt() string`

GetPrompt returns the Prompt field if non-nil, zero value otherwise.

### GetPromptOk

`func (o *VideoGenerationRequest) GetPromptOk() (*string, bool)`

GetPromptOk returns a tuple with the Prompt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPrompt

`func (o *VideoGenerationRequest) SetPrompt(v string)`

SetPrompt sets Prompt field to given value.


### GetDuration

`func (o *VideoGenerationRequest) GetDuration() int32`

GetDuration returns the Duration field if non-nil, zero value otherwise.

### GetDurationOk

`func (o *VideoGenerationRequest) GetDurationOk() (*int32, bool)`

GetDurationOk returns a tuple with the Duration field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDuration

`func (o *VideoGenerationRequest) SetDuration(v int32)`

SetDuration sets Duration field to given value.

### HasDuration

`func (o *VideoGenerationRequest) HasDuration() bool`

HasDuration returns a boolean if a field has been set.

### GetRatio

`func (o *VideoGenerationRequest) GetRatio() string`

GetRatio returns the Ratio field if non-nil, zero value otherwise.

### GetRatioOk

`func (o *VideoGenerationRequest) GetRatioOk() (*string, bool)`

GetRatioOk returns a tuple with the Ratio field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRatio

`func (o *VideoGenerationRequest) SetRatio(v string)`

SetRatio sets Ratio field to given value.

### HasRatio

`func (o *VideoGenerationRequest) HasRatio() bool`

HasRatio returns a boolean if a field has been set.

### GetProvider

`func (o *VideoGenerationRequest) GetProvider() ProviderRoutingOptions`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *VideoGenerationRequest) GetProviderOk() (*ProviderRoutingOptions, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *VideoGenerationRequest) SetProvider(v ProviderRoutingOptions)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *VideoGenerationRequest) HasProvider() bool`

HasProvider returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


