# OcrRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**Image** | **string** |  | 
**Language** | Pointer to **string** |  | [optional] 
**Debug** | Pointer to [**DebugOptions**](DebugOptions.md) |  | [optional] 
**Provider** | Pointer to [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 

## Methods

### NewOcrRequest

`func NewOcrRequest(model string, image string, ) *OcrRequest`

NewOcrRequest instantiates a new OcrRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewOcrRequestWithDefaults

`func NewOcrRequestWithDefaults() *OcrRequest`

NewOcrRequestWithDefaults instantiates a new OcrRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetModel

`func (o *OcrRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *OcrRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *OcrRequest) SetModel(v string)`

SetModel sets Model field to given value.


### GetImage

`func (o *OcrRequest) GetImage() string`

GetImage returns the Image field if non-nil, zero value otherwise.

### GetImageOk

`func (o *OcrRequest) GetImageOk() (*string, bool)`

GetImageOk returns a tuple with the Image field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetImage

`func (o *OcrRequest) SetImage(v string)`

SetImage sets Image field to given value.


### GetLanguage

`func (o *OcrRequest) GetLanguage() string`

GetLanguage returns the Language field if non-nil, zero value otherwise.

### GetLanguageOk

`func (o *OcrRequest) GetLanguageOk() (*string, bool)`

GetLanguageOk returns a tuple with the Language field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLanguage

`func (o *OcrRequest) SetLanguage(v string)`

SetLanguage sets Language field to given value.

### HasLanguage

`func (o *OcrRequest) HasLanguage() bool`

HasLanguage returns a boolean if a field has been set.

### GetDebug

`func (o *OcrRequest) GetDebug() DebugOptions`

GetDebug returns the Debug field if non-nil, zero value otherwise.

### GetDebugOk

`func (o *OcrRequest) GetDebugOk() (*DebugOptions, bool)`

GetDebugOk returns a tuple with the Debug field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDebug

`func (o *OcrRequest) SetDebug(v DebugOptions)`

SetDebug sets Debug field to given value.

### HasDebug

`func (o *OcrRequest) HasDebug() bool`

HasDebug returns a boolean if a field has been set.

### GetProvider

`func (o *OcrRequest) GetProvider() ProviderRoutingOptions`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *OcrRequest) GetProviderOk() (*ProviderRoutingOptions, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *OcrRequest) SetProvider(v ProviderRoutingOptions)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *OcrRequest) HasProvider() bool`

HasProvider returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


