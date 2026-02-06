# AnthropicContentBlock

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Type** | Pointer to **string** |  | [optional] 
**Text** | Pointer to **string** |  | [optional] 
**CacheControl** | Pointer to [**CacheControl**](CacheControl.md) |  | [optional] 
**Source** | Pointer to [**AnthropicContentBlockSource**](AnthropicContentBlockSource.md) |  | [optional] 
**ImageUrl** | Pointer to [**AnthropicContentBlockImageUrl**](AnthropicContentBlockImageUrl.md) |  | [optional] 
**InputAudio** | Pointer to [**AudioContentPartInputAudio**](AudioContentPartInputAudio.md) |  | [optional] 
**VideoUrl** | Pointer to **string** |  | [optional] 
**Id** | Pointer to **string** |  | [optional] 
**Name** | Pointer to **string** |  | [optional] 
**Input** | Pointer to **map[string]interface{}** |  | [optional] 
**ToolUseId** | Pointer to **string** |  | [optional] 
**Content** | Pointer to **string** |  | [optional] 

## Methods

### NewAnthropicContentBlock

`func NewAnthropicContentBlock() *AnthropicContentBlock`

NewAnthropicContentBlock instantiates a new AnthropicContentBlock object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewAnthropicContentBlockWithDefaults

`func NewAnthropicContentBlockWithDefaults() *AnthropicContentBlock`

NewAnthropicContentBlockWithDefaults instantiates a new AnthropicContentBlock object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetType

`func (o *AnthropicContentBlock) GetType() string`

GetType returns the Type field if non-nil, zero value otherwise.

### GetTypeOk

`func (o *AnthropicContentBlock) GetTypeOk() (*string, bool)`

GetTypeOk returns a tuple with the Type field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetType

`func (o *AnthropicContentBlock) SetType(v string)`

SetType sets Type field to given value.

### HasType

`func (o *AnthropicContentBlock) HasType() bool`

HasType returns a boolean if a field has been set.

### GetText

`func (o *AnthropicContentBlock) GetText() string`

GetText returns the Text field if non-nil, zero value otherwise.

### GetTextOk

`func (o *AnthropicContentBlock) GetTextOk() (*string, bool)`

GetTextOk returns a tuple with the Text field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetText

`func (o *AnthropicContentBlock) SetText(v string)`

SetText sets Text field to given value.

### HasText

`func (o *AnthropicContentBlock) HasText() bool`

HasText returns a boolean if a field has been set.

### GetCacheControl

`func (o *AnthropicContentBlock) GetCacheControl() CacheControl`

GetCacheControl returns the CacheControl field if non-nil, zero value otherwise.

### GetCacheControlOk

`func (o *AnthropicContentBlock) GetCacheControlOk() (*CacheControl, bool)`

GetCacheControlOk returns a tuple with the CacheControl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCacheControl

`func (o *AnthropicContentBlock) SetCacheControl(v CacheControl)`

SetCacheControl sets CacheControl field to given value.

### HasCacheControl

`func (o *AnthropicContentBlock) HasCacheControl() bool`

HasCacheControl returns a boolean if a field has been set.

### GetSource

`func (o *AnthropicContentBlock) GetSource() AnthropicContentBlockSource`

GetSource returns the Source field if non-nil, zero value otherwise.

### GetSourceOk

`func (o *AnthropicContentBlock) GetSourceOk() (*AnthropicContentBlockSource, bool)`

GetSourceOk returns a tuple with the Source field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSource

`func (o *AnthropicContentBlock) SetSource(v AnthropicContentBlockSource)`

SetSource sets Source field to given value.

### HasSource

`func (o *AnthropicContentBlock) HasSource() bool`

HasSource returns a boolean if a field has been set.

### GetImageUrl

`func (o *AnthropicContentBlock) GetImageUrl() AnthropicContentBlockImageUrl`

GetImageUrl returns the ImageUrl field if non-nil, zero value otherwise.

### GetImageUrlOk

`func (o *AnthropicContentBlock) GetImageUrlOk() (*AnthropicContentBlockImageUrl, bool)`

GetImageUrlOk returns a tuple with the ImageUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetImageUrl

`func (o *AnthropicContentBlock) SetImageUrl(v AnthropicContentBlockImageUrl)`

SetImageUrl sets ImageUrl field to given value.

### HasImageUrl

`func (o *AnthropicContentBlock) HasImageUrl() bool`

HasImageUrl returns a boolean if a field has been set.

### GetInputAudio

`func (o *AnthropicContentBlock) GetInputAudio() AudioContentPartInputAudio`

GetInputAudio returns the InputAudio field if non-nil, zero value otherwise.

### GetInputAudioOk

`func (o *AnthropicContentBlock) GetInputAudioOk() (*AudioContentPartInputAudio, bool)`

GetInputAudioOk returns a tuple with the InputAudio field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputAudio

`func (o *AnthropicContentBlock) SetInputAudio(v AudioContentPartInputAudio)`

SetInputAudio sets InputAudio field to given value.

### HasInputAudio

`func (o *AnthropicContentBlock) HasInputAudio() bool`

HasInputAudio returns a boolean if a field has been set.

### GetVideoUrl

`func (o *AnthropicContentBlock) GetVideoUrl() string`

GetVideoUrl returns the VideoUrl field if non-nil, zero value otherwise.

### GetVideoUrlOk

`func (o *AnthropicContentBlock) GetVideoUrlOk() (*string, bool)`

GetVideoUrlOk returns a tuple with the VideoUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetVideoUrl

`func (o *AnthropicContentBlock) SetVideoUrl(v string)`

SetVideoUrl sets VideoUrl field to given value.

### HasVideoUrl

`func (o *AnthropicContentBlock) HasVideoUrl() bool`

HasVideoUrl returns a boolean if a field has been set.

### GetId

`func (o *AnthropicContentBlock) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *AnthropicContentBlock) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *AnthropicContentBlock) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *AnthropicContentBlock) HasId() bool`

HasId returns a boolean if a field has been set.

### GetName

`func (o *AnthropicContentBlock) GetName() string`

GetName returns the Name field if non-nil, zero value otherwise.

### GetNameOk

`func (o *AnthropicContentBlock) GetNameOk() (*string, bool)`

GetNameOk returns a tuple with the Name field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetName

`func (o *AnthropicContentBlock) SetName(v string)`

SetName sets Name field to given value.

### HasName

`func (o *AnthropicContentBlock) HasName() bool`

HasName returns a boolean if a field has been set.

### GetInput

`func (o *AnthropicContentBlock) GetInput() map[string]interface{}`

GetInput returns the Input field if non-nil, zero value otherwise.

### GetInputOk

`func (o *AnthropicContentBlock) GetInputOk() (*map[string]interface{}, bool)`

GetInputOk returns a tuple with the Input field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInput

`func (o *AnthropicContentBlock) SetInput(v map[string]interface{})`

SetInput sets Input field to given value.

### HasInput

`func (o *AnthropicContentBlock) HasInput() bool`

HasInput returns a boolean if a field has been set.

### GetToolUseId

`func (o *AnthropicContentBlock) GetToolUseId() string`

GetToolUseId returns the ToolUseId field if non-nil, zero value otherwise.

### GetToolUseIdOk

`func (o *AnthropicContentBlock) GetToolUseIdOk() (*string, bool)`

GetToolUseIdOk returns a tuple with the ToolUseId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetToolUseId

`func (o *AnthropicContentBlock) SetToolUseId(v string)`

SetToolUseId sets ToolUseId field to given value.

### HasToolUseId

`func (o *AnthropicContentBlock) HasToolUseId() bool`

HasToolUseId returns a boolean if a field has been set.

### GetContent

`func (o *AnthropicContentBlock) GetContent() string`

GetContent returns the Content field if non-nil, zero value otherwise.

### GetContentOk

`func (o *AnthropicContentBlock) GetContentOk() (*string, bool)`

GetContentOk returns a tuple with the Content field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContent

`func (o *AnthropicContentBlock) SetContent(v string)`

SetContent sets Content field to given value.

### HasContent

`func (o *AnthropicContentBlock) HasContent() bool`

HasContent returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


