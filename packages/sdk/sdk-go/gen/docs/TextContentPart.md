# TextContentPart

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Type** | **string** |  | 
**Text** | **string** |  | 
**CacheControl** | Pointer to [**CacheControl**](CacheControl.md) |  | [optional] 

## Methods

### NewTextContentPart

`func NewTextContentPart(type_ string, text string, ) *TextContentPart`

NewTextContentPart instantiates a new TextContentPart object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewTextContentPartWithDefaults

`func NewTextContentPartWithDefaults() *TextContentPart`

NewTextContentPartWithDefaults instantiates a new TextContentPart object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetType

`func (o *TextContentPart) GetType() string`

GetType returns the Type field if non-nil, zero value otherwise.

### GetTypeOk

`func (o *TextContentPart) GetTypeOk() (*string, bool)`

GetTypeOk returns a tuple with the Type field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetType

`func (o *TextContentPart) SetType(v string)`

SetType sets Type field to given value.


### GetText

`func (o *TextContentPart) GetText() string`

GetText returns the Text field if non-nil, zero value otherwise.

### GetTextOk

`func (o *TextContentPart) GetTextOk() (*string, bool)`

GetTextOk returns a tuple with the Text field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetText

`func (o *TextContentPart) SetText(v string)`

SetText sets Text field to given value.


### GetCacheControl

`func (o *TextContentPart) GetCacheControl() CacheControl`

GetCacheControl returns the CacheControl field if non-nil, zero value otherwise.

### GetCacheControlOk

`func (o *TextContentPart) GetCacheControlOk() (*CacheControl, bool)`

GetCacheControlOk returns a tuple with the CacheControl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCacheControl

`func (o *TextContentPart) SetCacheControl(v CacheControl)`

SetCacheControl sets CacheControl field to given value.

### HasCacheControl

`func (o *TextContentPart) HasCacheControl() bool`

HasCacheControl returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


