# EmbeddingsRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | Pointer to **string** |  | [optional] 
**Input** | Pointer to [**NullableOneOfstringarray**](oneOf&lt;string,array&gt;.md) |  | [optional] 
**Inputs** | Pointer to [**NullableOneOfstringarray**](oneOf&lt;string,array&gt;.md) | Alias for input. | [optional] 
**EncodingFormat** | Pointer to **string** |  | [optional] 
**Dimensions** | Pointer to **int32** |  | [optional] 
**EmbeddingOptions** | Pointer to **map[string]interface{}** |  | [optional] 
**User** | Pointer to **string** |  | [optional] 
**Provider** | Pointer to [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 

## Methods

### NewEmbeddingsRequest

`func NewEmbeddingsRequest() *EmbeddingsRequest`

NewEmbeddingsRequest instantiates a new EmbeddingsRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewEmbeddingsRequestWithDefaults

`func NewEmbeddingsRequestWithDefaults() *EmbeddingsRequest`

NewEmbeddingsRequestWithDefaults instantiates a new EmbeddingsRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetModel

`func (o *EmbeddingsRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *EmbeddingsRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *EmbeddingsRequest) SetModel(v string)`

SetModel sets Model field to given value.

### HasModel

`func (o *EmbeddingsRequest) HasModel() bool`

HasModel returns a boolean if a field has been set.

### GetInput

`func (o *EmbeddingsRequest) GetInput() OneOfstringarray`

GetInput returns the Input field if non-nil, zero value otherwise.

### GetInputOk

`func (o *EmbeddingsRequest) GetInputOk() (*OneOfstringarray, bool)`

GetInputOk returns a tuple with the Input field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInput

`func (o *EmbeddingsRequest) SetInput(v OneOfstringarray)`

SetInput sets Input field to given value.

### HasInput

`func (o *EmbeddingsRequest) HasInput() bool`

HasInput returns a boolean if a field has been set.

### SetInputNil

`func (o *EmbeddingsRequest) SetInputNil(b bool)`

 SetInputNil sets the value for Input to be an explicit nil

### UnsetInput
`func (o *EmbeddingsRequest) UnsetInput()`

UnsetInput ensures that no value is present for Input, not even an explicit nil
### GetInputs

`func (o *EmbeddingsRequest) GetInputs() OneOfstringarray`

GetInputs returns the Inputs field if non-nil, zero value otherwise.

### GetInputsOk

`func (o *EmbeddingsRequest) GetInputsOk() (*OneOfstringarray, bool)`

GetInputsOk returns a tuple with the Inputs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputs

`func (o *EmbeddingsRequest) SetInputs(v OneOfstringarray)`

SetInputs sets Inputs field to given value.

### HasInputs

`func (o *EmbeddingsRequest) HasInputs() bool`

HasInputs returns a boolean if a field has been set.

### SetInputsNil

`func (o *EmbeddingsRequest) SetInputsNil(b bool)`

 SetInputsNil sets the value for Inputs to be an explicit nil

### UnsetInputs
`func (o *EmbeddingsRequest) UnsetInputs()`

UnsetInputs ensures that no value is present for Inputs, not even an explicit nil
### GetEncodingFormat

`func (o *EmbeddingsRequest) GetEncodingFormat() string`

GetEncodingFormat returns the EncodingFormat field if non-nil, zero value otherwise.

### GetEncodingFormatOk

`func (o *EmbeddingsRequest) GetEncodingFormatOk() (*string, bool)`

GetEncodingFormatOk returns a tuple with the EncodingFormat field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEncodingFormat

`func (o *EmbeddingsRequest) SetEncodingFormat(v string)`

SetEncodingFormat sets EncodingFormat field to given value.

### HasEncodingFormat

`func (o *EmbeddingsRequest) HasEncodingFormat() bool`

HasEncodingFormat returns a boolean if a field has been set.

### GetDimensions

`func (o *EmbeddingsRequest) GetDimensions() int32`

GetDimensions returns the Dimensions field if non-nil, zero value otherwise.

### GetDimensionsOk

`func (o *EmbeddingsRequest) GetDimensionsOk() (*int32, bool)`

GetDimensionsOk returns a tuple with the Dimensions field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDimensions

`func (o *EmbeddingsRequest) SetDimensions(v int32)`

SetDimensions sets Dimensions field to given value.

### HasDimensions

`func (o *EmbeddingsRequest) HasDimensions() bool`

HasDimensions returns a boolean if a field has been set.

### GetEmbeddingOptions

`func (o *EmbeddingsRequest) GetEmbeddingOptions() map[string]interface{}`

GetEmbeddingOptions returns the EmbeddingOptions field if non-nil, zero value otherwise.

### GetEmbeddingOptionsOk

`func (o *EmbeddingsRequest) GetEmbeddingOptionsOk() (*map[string]interface{}, bool)`

GetEmbeddingOptionsOk returns a tuple with the EmbeddingOptions field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEmbeddingOptions

`func (o *EmbeddingsRequest) SetEmbeddingOptions(v map[string]interface{})`

SetEmbeddingOptions sets EmbeddingOptions field to given value.

### HasEmbeddingOptions

`func (o *EmbeddingsRequest) HasEmbeddingOptions() bool`

HasEmbeddingOptions returns a boolean if a field has been set.

### GetUser

`func (o *EmbeddingsRequest) GetUser() string`

GetUser returns the User field if non-nil, zero value otherwise.

### GetUserOk

`func (o *EmbeddingsRequest) GetUserOk() (*string, bool)`

GetUserOk returns a tuple with the User field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUser

`func (o *EmbeddingsRequest) SetUser(v string)`

SetUser sets User field to given value.

### HasUser

`func (o *EmbeddingsRequest) HasUser() bool`

HasUser returns a boolean if a field has been set.

### GetProvider

`func (o *EmbeddingsRequest) GetProvider() ProviderRoutingOptions`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *EmbeddingsRequest) GetProviderOk() (*ProviderRoutingOptions, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *EmbeddingsRequest) SetProvider(v ProviderRoutingOptions)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *EmbeddingsRequest) HasProvider() bool`

HasProvider returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


