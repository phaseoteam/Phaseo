# ImagesGenerationRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**Prompt** | **string** |  | 
**Size** | Pointer to **string** |  | [optional] 
**N** | Pointer to **int32** |  | [optional] 
**Quality** | Pointer to **string** |  | [optional] 
**ResponseFormat** | Pointer to **string** |  | [optional] 
**Style** | Pointer to **string** |  | [optional] 
**User** | Pointer to **string** |  | [optional] 
**Debug** | Pointer to [**DebugOptions**](DebugOptions.md) |  | [optional] 
**Provider** | Pointer to [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 

## Methods

### NewImagesGenerationRequest

`func NewImagesGenerationRequest(model string, prompt string, ) *ImagesGenerationRequest`

NewImagesGenerationRequest instantiates a new ImagesGenerationRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewImagesGenerationRequestWithDefaults

`func NewImagesGenerationRequestWithDefaults() *ImagesGenerationRequest`

NewImagesGenerationRequestWithDefaults instantiates a new ImagesGenerationRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetModel

`func (o *ImagesGenerationRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *ImagesGenerationRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *ImagesGenerationRequest) SetModel(v string)`

SetModel sets Model field to given value.


### GetPrompt

`func (o *ImagesGenerationRequest) GetPrompt() string`

GetPrompt returns the Prompt field if non-nil, zero value otherwise.

### GetPromptOk

`func (o *ImagesGenerationRequest) GetPromptOk() (*string, bool)`

GetPromptOk returns a tuple with the Prompt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPrompt

`func (o *ImagesGenerationRequest) SetPrompt(v string)`

SetPrompt sets Prompt field to given value.


### GetSize

`func (o *ImagesGenerationRequest) GetSize() string`

GetSize returns the Size field if non-nil, zero value otherwise.

### GetSizeOk

`func (o *ImagesGenerationRequest) GetSizeOk() (*string, bool)`

GetSizeOk returns a tuple with the Size field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSize

`func (o *ImagesGenerationRequest) SetSize(v string)`

SetSize sets Size field to given value.

### HasSize

`func (o *ImagesGenerationRequest) HasSize() bool`

HasSize returns a boolean if a field has been set.

### GetN

`func (o *ImagesGenerationRequest) GetN() int32`

GetN returns the N field if non-nil, zero value otherwise.

### GetNOk

`func (o *ImagesGenerationRequest) GetNOk() (*int32, bool)`

GetNOk returns a tuple with the N field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetN

`func (o *ImagesGenerationRequest) SetN(v int32)`

SetN sets N field to given value.

### HasN

`func (o *ImagesGenerationRequest) HasN() bool`

HasN returns a boolean if a field has been set.

### GetQuality

`func (o *ImagesGenerationRequest) GetQuality() string`

GetQuality returns the Quality field if non-nil, zero value otherwise.

### GetQualityOk

`func (o *ImagesGenerationRequest) GetQualityOk() (*string, bool)`

GetQualityOk returns a tuple with the Quality field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetQuality

`func (o *ImagesGenerationRequest) SetQuality(v string)`

SetQuality sets Quality field to given value.

### HasQuality

`func (o *ImagesGenerationRequest) HasQuality() bool`

HasQuality returns a boolean if a field has been set.

### GetResponseFormat

`func (o *ImagesGenerationRequest) GetResponseFormat() string`

GetResponseFormat returns the ResponseFormat field if non-nil, zero value otherwise.

### GetResponseFormatOk

`func (o *ImagesGenerationRequest) GetResponseFormatOk() (*string, bool)`

GetResponseFormatOk returns a tuple with the ResponseFormat field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetResponseFormat

`func (o *ImagesGenerationRequest) SetResponseFormat(v string)`

SetResponseFormat sets ResponseFormat field to given value.

### HasResponseFormat

`func (o *ImagesGenerationRequest) HasResponseFormat() bool`

HasResponseFormat returns a boolean if a field has been set.

### GetStyle

`func (o *ImagesGenerationRequest) GetStyle() string`

GetStyle returns the Style field if non-nil, zero value otherwise.

### GetStyleOk

`func (o *ImagesGenerationRequest) GetStyleOk() (*string, bool)`

GetStyleOk returns a tuple with the Style field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStyle

`func (o *ImagesGenerationRequest) SetStyle(v string)`

SetStyle sets Style field to given value.

### HasStyle

`func (o *ImagesGenerationRequest) HasStyle() bool`

HasStyle returns a boolean if a field has been set.

### GetUser

`func (o *ImagesGenerationRequest) GetUser() string`

GetUser returns the User field if non-nil, zero value otherwise.

### GetUserOk

`func (o *ImagesGenerationRequest) GetUserOk() (*string, bool)`

GetUserOk returns a tuple with the User field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUser

`func (o *ImagesGenerationRequest) SetUser(v string)`

SetUser sets User field to given value.

### HasUser

`func (o *ImagesGenerationRequest) HasUser() bool`

HasUser returns a boolean if a field has been set.

### GetDebug

`func (o *ImagesGenerationRequest) GetDebug() DebugOptions`

GetDebug returns the Debug field if non-nil, zero value otherwise.

### GetDebugOk

`func (o *ImagesGenerationRequest) GetDebugOk() (*DebugOptions, bool)`

GetDebugOk returns a tuple with the Debug field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDebug

`func (o *ImagesGenerationRequest) SetDebug(v DebugOptions)`

SetDebug sets Debug field to given value.

### HasDebug

`func (o *ImagesGenerationRequest) HasDebug() bool`

HasDebug returns a boolean if a field has been set.

### GetProvider

`func (o *ImagesGenerationRequest) GetProvider() ProviderRoutingOptions`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *ImagesGenerationRequest) GetProviderOk() (*ProviderRoutingOptions, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *ImagesGenerationRequest) SetProvider(v ProviderRoutingOptions)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *ImagesGenerationRequest) HasProvider() bool`

HasProvider returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


