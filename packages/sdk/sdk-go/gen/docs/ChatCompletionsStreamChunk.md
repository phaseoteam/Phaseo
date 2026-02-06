# ChatCompletionsStreamChunk

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | Pointer to **string** |  | [optional] 
**NativeResponseId** | Pointer to **string** |  | [optional] 
**Object** | Pointer to **string** |  | [optional] 
**Created** | Pointer to **int32** |  | [optional] 
**Model** | Pointer to **string** |  | [optional] 
**SystemFingerprint** | Pointer to **string** |  | [optional] 
**ServiceTier** | Pointer to **string** |  | [optional] 
**Choices** | Pointer to [**[]ChatCompletionsStreamChoice**](ChatCompletionsStreamChoice.md) |  | [optional] 
**Usage** | Pointer to [**Usage**](Usage.md) |  | [optional] 
**Meta** | Pointer to **map[string]interface{}** |  | [optional] 

## Methods

### NewChatCompletionsStreamChunk

`func NewChatCompletionsStreamChunk() *ChatCompletionsStreamChunk`

NewChatCompletionsStreamChunk instantiates a new ChatCompletionsStreamChunk object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewChatCompletionsStreamChunkWithDefaults

`func NewChatCompletionsStreamChunkWithDefaults() *ChatCompletionsStreamChunk`

NewChatCompletionsStreamChunkWithDefaults instantiates a new ChatCompletionsStreamChunk object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *ChatCompletionsStreamChunk) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *ChatCompletionsStreamChunk) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *ChatCompletionsStreamChunk) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *ChatCompletionsStreamChunk) HasId() bool`

HasId returns a boolean if a field has been set.

### GetNativeResponseId

`func (o *ChatCompletionsStreamChunk) GetNativeResponseId() string`

GetNativeResponseId returns the NativeResponseId field if non-nil, zero value otherwise.

### GetNativeResponseIdOk

`func (o *ChatCompletionsStreamChunk) GetNativeResponseIdOk() (*string, bool)`

GetNativeResponseIdOk returns a tuple with the NativeResponseId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetNativeResponseId

`func (o *ChatCompletionsStreamChunk) SetNativeResponseId(v string)`

SetNativeResponseId sets NativeResponseId field to given value.

### HasNativeResponseId

`func (o *ChatCompletionsStreamChunk) HasNativeResponseId() bool`

HasNativeResponseId returns a boolean if a field has been set.

### GetObject

`func (o *ChatCompletionsStreamChunk) GetObject() string`

GetObject returns the Object field if non-nil, zero value otherwise.

### GetObjectOk

`func (o *ChatCompletionsStreamChunk) GetObjectOk() (*string, bool)`

GetObjectOk returns a tuple with the Object field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetObject

`func (o *ChatCompletionsStreamChunk) SetObject(v string)`

SetObject sets Object field to given value.

### HasObject

`func (o *ChatCompletionsStreamChunk) HasObject() bool`

HasObject returns a boolean if a field has been set.

### GetCreated

`func (o *ChatCompletionsStreamChunk) GetCreated() int32`

GetCreated returns the Created field if non-nil, zero value otherwise.

### GetCreatedOk

`func (o *ChatCompletionsStreamChunk) GetCreatedOk() (*int32, bool)`

GetCreatedOk returns a tuple with the Created field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCreated

`func (o *ChatCompletionsStreamChunk) SetCreated(v int32)`

SetCreated sets Created field to given value.

### HasCreated

`func (o *ChatCompletionsStreamChunk) HasCreated() bool`

HasCreated returns a boolean if a field has been set.

### GetModel

`func (o *ChatCompletionsStreamChunk) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *ChatCompletionsStreamChunk) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *ChatCompletionsStreamChunk) SetModel(v string)`

SetModel sets Model field to given value.

### HasModel

`func (o *ChatCompletionsStreamChunk) HasModel() bool`

HasModel returns a boolean if a field has been set.

### GetSystemFingerprint

`func (o *ChatCompletionsStreamChunk) GetSystemFingerprint() string`

GetSystemFingerprint returns the SystemFingerprint field if non-nil, zero value otherwise.

### GetSystemFingerprintOk

`func (o *ChatCompletionsStreamChunk) GetSystemFingerprintOk() (*string, bool)`

GetSystemFingerprintOk returns a tuple with the SystemFingerprint field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSystemFingerprint

`func (o *ChatCompletionsStreamChunk) SetSystemFingerprint(v string)`

SetSystemFingerprint sets SystemFingerprint field to given value.

### HasSystemFingerprint

`func (o *ChatCompletionsStreamChunk) HasSystemFingerprint() bool`

HasSystemFingerprint returns a boolean if a field has been set.

### GetServiceTier

`func (o *ChatCompletionsStreamChunk) GetServiceTier() string`

GetServiceTier returns the ServiceTier field if non-nil, zero value otherwise.

### GetServiceTierOk

`func (o *ChatCompletionsStreamChunk) GetServiceTierOk() (*string, bool)`

GetServiceTierOk returns a tuple with the ServiceTier field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetServiceTier

`func (o *ChatCompletionsStreamChunk) SetServiceTier(v string)`

SetServiceTier sets ServiceTier field to given value.

### HasServiceTier

`func (o *ChatCompletionsStreamChunk) HasServiceTier() bool`

HasServiceTier returns a boolean if a field has been set.

### GetChoices

`func (o *ChatCompletionsStreamChunk) GetChoices() []ChatCompletionsStreamChoice`

GetChoices returns the Choices field if non-nil, zero value otherwise.

### GetChoicesOk

`func (o *ChatCompletionsStreamChunk) GetChoicesOk() (*[]ChatCompletionsStreamChoice, bool)`

GetChoicesOk returns a tuple with the Choices field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetChoices

`func (o *ChatCompletionsStreamChunk) SetChoices(v []ChatCompletionsStreamChoice)`

SetChoices sets Choices field to given value.

### HasChoices

`func (o *ChatCompletionsStreamChunk) HasChoices() bool`

HasChoices returns a boolean if a field has been set.

### GetUsage

`func (o *ChatCompletionsStreamChunk) GetUsage() Usage`

GetUsage returns the Usage field if non-nil, zero value otherwise.

### GetUsageOk

`func (o *ChatCompletionsStreamChunk) GetUsageOk() (*Usage, bool)`

GetUsageOk returns a tuple with the Usage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUsage

`func (o *ChatCompletionsStreamChunk) SetUsage(v Usage)`

SetUsage sets Usage field to given value.

### HasUsage

`func (o *ChatCompletionsStreamChunk) HasUsage() bool`

HasUsage returns a boolean if a field has been set.

### GetMeta

`func (o *ChatCompletionsStreamChunk) GetMeta() map[string]interface{}`

GetMeta returns the Meta field if non-nil, zero value otherwise.

### GetMetaOk

`func (o *ChatCompletionsStreamChunk) GetMetaOk() (*map[string]interface{}, bool)`

GetMetaOk returns a tuple with the Meta field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMeta

`func (o *ChatCompletionsStreamChunk) SetMeta(v map[string]interface{})`

SetMeta sets Meta field to given value.

### HasMeta

`func (o *ChatCompletionsStreamChunk) HasMeta() bool`

HasMeta returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


