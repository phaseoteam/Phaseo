# MessageContentPart

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Type** | **string** |  | 
**Text** | **string** |  | 
**ImageUrl** | [**ImageContentPartImageUrl**](ImageContentPartImageUrl.md) |  | 
**InputAudio** | [**AudioContentPartInputAudio**](AudioContentPartInputAudio.md) |  | 
**VideoUrl** | **string** |  | 
**Id** | **string** |  | 
**Function** | [**ToolCallContentPartFunction**](ToolCallContentPartFunction.md) |  | 

## Methods

### NewMessageContentPart

`func NewMessageContentPart(type_ string, text string, imageUrl ImageContentPartImageUrl, inputAudio AudioContentPartInputAudio, videoUrl string, id string, function ToolCallContentPartFunction, ) *MessageContentPart`

NewMessageContentPart instantiates a new MessageContentPart object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewMessageContentPartWithDefaults

`func NewMessageContentPartWithDefaults() *MessageContentPart`

NewMessageContentPartWithDefaults instantiates a new MessageContentPart object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetType

`func (o *MessageContentPart) GetType() string`

GetType returns the Type field if non-nil, zero value otherwise.

### GetTypeOk

`func (o *MessageContentPart) GetTypeOk() (*string, bool)`

GetTypeOk returns a tuple with the Type field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetType

`func (o *MessageContentPart) SetType(v string)`

SetType sets Type field to given value.


### GetText

`func (o *MessageContentPart) GetText() string`

GetText returns the Text field if non-nil, zero value otherwise.

### GetTextOk

`func (o *MessageContentPart) GetTextOk() (*string, bool)`

GetTextOk returns a tuple with the Text field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetText

`func (o *MessageContentPart) SetText(v string)`

SetText sets Text field to given value.


### GetImageUrl

`func (o *MessageContentPart) GetImageUrl() ImageContentPartImageUrl`

GetImageUrl returns the ImageUrl field if non-nil, zero value otherwise.

### GetImageUrlOk

`func (o *MessageContentPart) GetImageUrlOk() (*ImageContentPartImageUrl, bool)`

GetImageUrlOk returns a tuple with the ImageUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetImageUrl

`func (o *MessageContentPart) SetImageUrl(v ImageContentPartImageUrl)`

SetImageUrl sets ImageUrl field to given value.


### GetInputAudio

`func (o *MessageContentPart) GetInputAudio() AudioContentPartInputAudio`

GetInputAudio returns the InputAudio field if non-nil, zero value otherwise.

### GetInputAudioOk

`func (o *MessageContentPart) GetInputAudioOk() (*AudioContentPartInputAudio, bool)`

GetInputAudioOk returns a tuple with the InputAudio field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputAudio

`func (o *MessageContentPart) SetInputAudio(v AudioContentPartInputAudio)`

SetInputAudio sets InputAudio field to given value.


### GetVideoUrl

`func (o *MessageContentPart) GetVideoUrl() string`

GetVideoUrl returns the VideoUrl field if non-nil, zero value otherwise.

### GetVideoUrlOk

`func (o *MessageContentPart) GetVideoUrlOk() (*string, bool)`

GetVideoUrlOk returns a tuple with the VideoUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetVideoUrl

`func (o *MessageContentPart) SetVideoUrl(v string)`

SetVideoUrl sets VideoUrl field to given value.


### GetId

`func (o *MessageContentPart) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *MessageContentPart) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *MessageContentPart) SetId(v string)`

SetId sets Id field to given value.


### GetFunction

`func (o *MessageContentPart) GetFunction() ToolCallContentPartFunction`

GetFunction returns the Function field if non-nil, zero value otherwise.

### GetFunctionOk

`func (o *MessageContentPart) GetFunctionOk() (*ToolCallContentPartFunction, bool)`

GetFunctionOk returns a tuple with the Function field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFunction

`func (o *MessageContentPart) SetFunction(v ToolCallContentPartFunction)`

SetFunction sets Function field to given value.



[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


