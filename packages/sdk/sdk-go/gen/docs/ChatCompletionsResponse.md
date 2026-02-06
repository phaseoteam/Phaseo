# ChatCompletionsResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | Pointer to **string** |  | [optional] 
**NativeResponseId** | Pointer to **string** |  | [optional] 
**Object** | Pointer to **string** |  | [optional] 
**Created** | Pointer to **int32** |  | [optional] 
**Model** | Pointer to **string** |  | [optional] 
**Choices** | Pointer to [**[]ChatChoice**](ChatChoice.md) |  | [optional] 
**Usage** | Pointer to [**Usage**](Usage.md) |  | [optional] 
**ServiceTier** | Pointer to **string** |  | [optional] 
**SystemFingerprint** | Pointer to **string** |  | [optional] 
**Meta** | Pointer to **map[string]interface{}** |  | [optional] 
**Debug** | Pointer to [**DebugResponse**](DebugResponse.md) |  | [optional] 
**UpstreamRequest** | Pointer to [**ChatCompletionsResponseUpstreamRequest**](ChatCompletionsResponseUpstreamRequest.md) |  | [optional] 
**UpstreamResponse** | Pointer to [**ChatCompletionsResponseUpstreamRequest**](ChatCompletionsResponseUpstreamRequest.md) |  | [optional] 

## Methods

### NewChatCompletionsResponse

`func NewChatCompletionsResponse() *ChatCompletionsResponse`

NewChatCompletionsResponse instantiates a new ChatCompletionsResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewChatCompletionsResponseWithDefaults

`func NewChatCompletionsResponseWithDefaults() *ChatCompletionsResponse`

NewChatCompletionsResponseWithDefaults instantiates a new ChatCompletionsResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *ChatCompletionsResponse) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *ChatCompletionsResponse) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *ChatCompletionsResponse) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *ChatCompletionsResponse) HasId() bool`

HasId returns a boolean if a field has been set.

### GetNativeResponseId

`func (o *ChatCompletionsResponse) GetNativeResponseId() string`

GetNativeResponseId returns the NativeResponseId field if non-nil, zero value otherwise.

### GetNativeResponseIdOk

`func (o *ChatCompletionsResponse) GetNativeResponseIdOk() (*string, bool)`

GetNativeResponseIdOk returns a tuple with the NativeResponseId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetNativeResponseId

`func (o *ChatCompletionsResponse) SetNativeResponseId(v string)`

SetNativeResponseId sets NativeResponseId field to given value.

### HasNativeResponseId

`func (o *ChatCompletionsResponse) HasNativeResponseId() bool`

HasNativeResponseId returns a boolean if a field has been set.

### GetObject

`func (o *ChatCompletionsResponse) GetObject() string`

GetObject returns the Object field if non-nil, zero value otherwise.

### GetObjectOk

`func (o *ChatCompletionsResponse) GetObjectOk() (*string, bool)`

GetObjectOk returns a tuple with the Object field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetObject

`func (o *ChatCompletionsResponse) SetObject(v string)`

SetObject sets Object field to given value.

### HasObject

`func (o *ChatCompletionsResponse) HasObject() bool`

HasObject returns a boolean if a field has been set.

### GetCreated

`func (o *ChatCompletionsResponse) GetCreated() int32`

GetCreated returns the Created field if non-nil, zero value otherwise.

### GetCreatedOk

`func (o *ChatCompletionsResponse) GetCreatedOk() (*int32, bool)`

GetCreatedOk returns a tuple with the Created field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCreated

`func (o *ChatCompletionsResponse) SetCreated(v int32)`

SetCreated sets Created field to given value.

### HasCreated

`func (o *ChatCompletionsResponse) HasCreated() bool`

HasCreated returns a boolean if a field has been set.

### GetModel

`func (o *ChatCompletionsResponse) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *ChatCompletionsResponse) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *ChatCompletionsResponse) SetModel(v string)`

SetModel sets Model field to given value.

### HasModel

`func (o *ChatCompletionsResponse) HasModel() bool`

HasModel returns a boolean if a field has been set.

### GetChoices

`func (o *ChatCompletionsResponse) GetChoices() []ChatChoice`

GetChoices returns the Choices field if non-nil, zero value otherwise.

### GetChoicesOk

`func (o *ChatCompletionsResponse) GetChoicesOk() (*[]ChatChoice, bool)`

GetChoicesOk returns a tuple with the Choices field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetChoices

`func (o *ChatCompletionsResponse) SetChoices(v []ChatChoice)`

SetChoices sets Choices field to given value.

### HasChoices

`func (o *ChatCompletionsResponse) HasChoices() bool`

HasChoices returns a boolean if a field has been set.

### GetUsage

`func (o *ChatCompletionsResponse) GetUsage() Usage`

GetUsage returns the Usage field if non-nil, zero value otherwise.

### GetUsageOk

`func (o *ChatCompletionsResponse) GetUsageOk() (*Usage, bool)`

GetUsageOk returns a tuple with the Usage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUsage

`func (o *ChatCompletionsResponse) SetUsage(v Usage)`

SetUsage sets Usage field to given value.

### HasUsage

`func (o *ChatCompletionsResponse) HasUsage() bool`

HasUsage returns a boolean if a field has been set.

### GetServiceTier

`func (o *ChatCompletionsResponse) GetServiceTier() string`

GetServiceTier returns the ServiceTier field if non-nil, zero value otherwise.

### GetServiceTierOk

`func (o *ChatCompletionsResponse) GetServiceTierOk() (*string, bool)`

GetServiceTierOk returns a tuple with the ServiceTier field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetServiceTier

`func (o *ChatCompletionsResponse) SetServiceTier(v string)`

SetServiceTier sets ServiceTier field to given value.

### HasServiceTier

`func (o *ChatCompletionsResponse) HasServiceTier() bool`

HasServiceTier returns a boolean if a field has been set.

### GetSystemFingerprint

`func (o *ChatCompletionsResponse) GetSystemFingerprint() string`

GetSystemFingerprint returns the SystemFingerprint field if non-nil, zero value otherwise.

### GetSystemFingerprintOk

`func (o *ChatCompletionsResponse) GetSystemFingerprintOk() (*string, bool)`

GetSystemFingerprintOk returns a tuple with the SystemFingerprint field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSystemFingerprint

`func (o *ChatCompletionsResponse) SetSystemFingerprint(v string)`

SetSystemFingerprint sets SystemFingerprint field to given value.

### HasSystemFingerprint

`func (o *ChatCompletionsResponse) HasSystemFingerprint() bool`

HasSystemFingerprint returns a boolean if a field has been set.

### GetMeta

`func (o *ChatCompletionsResponse) GetMeta() map[string]interface{}`

GetMeta returns the Meta field if non-nil, zero value otherwise.

### GetMetaOk

`func (o *ChatCompletionsResponse) GetMetaOk() (*map[string]interface{}, bool)`

GetMetaOk returns a tuple with the Meta field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMeta

`func (o *ChatCompletionsResponse) SetMeta(v map[string]interface{})`

SetMeta sets Meta field to given value.

### HasMeta

`func (o *ChatCompletionsResponse) HasMeta() bool`

HasMeta returns a boolean if a field has been set.

### GetDebug

`func (o *ChatCompletionsResponse) GetDebug() DebugResponse`

GetDebug returns the Debug field if non-nil, zero value otherwise.

### GetDebugOk

`func (o *ChatCompletionsResponse) GetDebugOk() (*DebugResponse, bool)`

GetDebugOk returns a tuple with the Debug field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDebug

`func (o *ChatCompletionsResponse) SetDebug(v DebugResponse)`

SetDebug sets Debug field to given value.

### HasDebug

`func (o *ChatCompletionsResponse) HasDebug() bool`

HasDebug returns a boolean if a field has been set.

### GetUpstreamRequest

`func (o *ChatCompletionsResponse) GetUpstreamRequest() ChatCompletionsResponseUpstreamRequest`

GetUpstreamRequest returns the UpstreamRequest field if non-nil, zero value otherwise.

### GetUpstreamRequestOk

`func (o *ChatCompletionsResponse) GetUpstreamRequestOk() (*ChatCompletionsResponseUpstreamRequest, bool)`

GetUpstreamRequestOk returns a tuple with the UpstreamRequest field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUpstreamRequest

`func (o *ChatCompletionsResponse) SetUpstreamRequest(v ChatCompletionsResponseUpstreamRequest)`

SetUpstreamRequest sets UpstreamRequest field to given value.

### HasUpstreamRequest

`func (o *ChatCompletionsResponse) HasUpstreamRequest() bool`

HasUpstreamRequest returns a boolean if a field has been set.

### GetUpstreamResponse

`func (o *ChatCompletionsResponse) GetUpstreamResponse() ChatCompletionsResponseUpstreamRequest`

GetUpstreamResponse returns the UpstreamResponse field if non-nil, zero value otherwise.

### GetUpstreamResponseOk

`func (o *ChatCompletionsResponse) GetUpstreamResponseOk() (*ChatCompletionsResponseUpstreamRequest, bool)`

GetUpstreamResponseOk returns a tuple with the UpstreamResponse field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUpstreamResponse

`func (o *ChatCompletionsResponse) SetUpstreamResponse(v ChatCompletionsResponseUpstreamRequest)`

SetUpstreamResponse sets UpstreamResponse field to given value.

### HasUpstreamResponse

`func (o *ChatCompletionsResponse) HasUpstreamResponse() bool`

HasUpstreamResponse returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


