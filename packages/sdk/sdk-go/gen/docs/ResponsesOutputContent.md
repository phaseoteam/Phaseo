# ResponsesOutputContent

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Type** | Pointer to **string** |  | [optional] 
**Text** | Pointer to **string** |  | [optional] 
**Annotations** | Pointer to **[]map[string]interface{}** |  | [optional] 
**ImageUrl** | Pointer to [**AnthropicContentBlockImageUrlOneOf**](AnthropicContentBlockImageUrlOneOf.md) |  | [optional] 
**B64Json** | Pointer to **string** |  | [optional] 
**MimeType** | Pointer to **string** |  | [optional] 

## Methods

### NewResponsesOutputContent

`func NewResponsesOutputContent() *ResponsesOutputContent`

NewResponsesOutputContent instantiates a new ResponsesOutputContent object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewResponsesOutputContentWithDefaults

`func NewResponsesOutputContentWithDefaults() *ResponsesOutputContent`

NewResponsesOutputContentWithDefaults instantiates a new ResponsesOutputContent object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetType

`func (o *ResponsesOutputContent) GetType() string`

GetType returns the Type field if non-nil, zero value otherwise.

### GetTypeOk

`func (o *ResponsesOutputContent) GetTypeOk() (*string, bool)`

GetTypeOk returns a tuple with the Type field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetType

`func (o *ResponsesOutputContent) SetType(v string)`

SetType sets Type field to given value.

### HasType

`func (o *ResponsesOutputContent) HasType() bool`

HasType returns a boolean if a field has been set.

### GetText

`func (o *ResponsesOutputContent) GetText() string`

GetText returns the Text field if non-nil, zero value otherwise.

### GetTextOk

`func (o *ResponsesOutputContent) GetTextOk() (*string, bool)`

GetTextOk returns a tuple with the Text field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetText

`func (o *ResponsesOutputContent) SetText(v string)`

SetText sets Text field to given value.

### HasText

`func (o *ResponsesOutputContent) HasText() bool`

HasText returns a boolean if a field has been set.

### GetAnnotations

`func (o *ResponsesOutputContent) GetAnnotations() []map[string]interface{}`

GetAnnotations returns the Annotations field if non-nil, zero value otherwise.

### GetAnnotationsOk

`func (o *ResponsesOutputContent) GetAnnotationsOk() (*[]map[string]interface{}, bool)`

GetAnnotationsOk returns a tuple with the Annotations field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAnnotations

`func (o *ResponsesOutputContent) SetAnnotations(v []map[string]interface{})`

SetAnnotations sets Annotations field to given value.

### HasAnnotations

`func (o *ResponsesOutputContent) HasAnnotations() bool`

HasAnnotations returns a boolean if a field has been set.

### GetImageUrl

`func (o *ResponsesOutputContent) GetImageUrl() AnthropicContentBlockImageUrlOneOf`

GetImageUrl returns the ImageUrl field if non-nil, zero value otherwise.

### GetImageUrlOk

`func (o *ResponsesOutputContent) GetImageUrlOk() (*AnthropicContentBlockImageUrlOneOf, bool)`

GetImageUrlOk returns a tuple with the ImageUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetImageUrl

`func (o *ResponsesOutputContent) SetImageUrl(v AnthropicContentBlockImageUrlOneOf)`

SetImageUrl sets ImageUrl field to given value.

### HasImageUrl

`func (o *ResponsesOutputContent) HasImageUrl() bool`

HasImageUrl returns a boolean if a field has been set.

### GetB64Json

`func (o *ResponsesOutputContent) GetB64Json() string`

GetB64Json returns the B64Json field if non-nil, zero value otherwise.

### GetB64JsonOk

`func (o *ResponsesOutputContent) GetB64JsonOk() (*string, bool)`

GetB64JsonOk returns a tuple with the B64Json field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetB64Json

`func (o *ResponsesOutputContent) SetB64Json(v string)`

SetB64Json sets B64Json field to given value.

### HasB64Json

`func (o *ResponsesOutputContent) HasB64Json() bool`

HasB64Json returns a boolean if a field has been set.

### GetMimeType

`func (o *ResponsesOutputContent) GetMimeType() string`

GetMimeType returns the MimeType field if non-nil, zero value otherwise.

### GetMimeTypeOk

`func (o *ResponsesOutputContent) GetMimeTypeOk() (*string, bool)`

GetMimeTypeOk returns a tuple with the MimeType field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMimeType

`func (o *ResponsesOutputContent) SetMimeType(v string)`

SetMimeType sets MimeType field to given value.

### HasMimeType

`func (o *ResponsesOutputContent) HasMimeType() bool`

HasMimeType returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


