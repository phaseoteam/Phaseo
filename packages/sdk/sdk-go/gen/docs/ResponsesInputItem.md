# ResponsesInputItem

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Type** | **string** |  | 
**Text** | **string** |  | 
**CacheControl** | Pointer to [**CacheControl**](CacheControl.md) |  | [optional] 
**ImageUrl** | [**InputImageContentPartImageUrl**](InputImageContentPartImageUrl.md) |  | 
**Detail** | Pointer to **string** |  | [optional] 
**InputAudio** | [**AudioContentPartInputAudio**](AudioContentPartInputAudio.md) |  | 
**VideoUrl** | **string** |  | 
**Role** | **string** |  | 
**Content** | [**ChatMessageContent**](ChatMessageContent.md) |  | 
**ToolCalls** | Pointer to [**[]ToolCall**](ToolCall.md) |  | [optional] 
**ToolCallId** | Pointer to **string** |  | [optional] 
**CallId** | **string** |  | 
**Name** | **string** |  | 
**Arguments** | **string** |  | 
**Output** | **string** |  | 

## Methods

### NewResponsesInputItem

`func NewResponsesInputItem(type_ string, text string, imageUrl InputImageContentPartImageUrl, inputAudio AudioContentPartInputAudio, videoUrl string, role string, content ChatMessageContent, callId string, name string, arguments string, output string, ) *ResponsesInputItem`

NewResponsesInputItem instantiates a new ResponsesInputItem object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewResponsesInputItemWithDefaults

`func NewResponsesInputItemWithDefaults() *ResponsesInputItem`

NewResponsesInputItemWithDefaults instantiates a new ResponsesInputItem object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetType

`func (o *ResponsesInputItem) GetType() string`

GetType returns the Type field if non-nil, zero value otherwise.

### GetTypeOk

`func (o *ResponsesInputItem) GetTypeOk() (*string, bool)`

GetTypeOk returns a tuple with the Type field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetType

`func (o *ResponsesInputItem) SetType(v string)`

SetType sets Type field to given value.


### GetText

`func (o *ResponsesInputItem) GetText() string`

GetText returns the Text field if non-nil, zero value otherwise.

### GetTextOk

`func (o *ResponsesInputItem) GetTextOk() (*string, bool)`

GetTextOk returns a tuple with the Text field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetText

`func (o *ResponsesInputItem) SetText(v string)`

SetText sets Text field to given value.


### GetCacheControl

`func (o *ResponsesInputItem) GetCacheControl() CacheControl`

GetCacheControl returns the CacheControl field if non-nil, zero value otherwise.

### GetCacheControlOk

`func (o *ResponsesInputItem) GetCacheControlOk() (*CacheControl, bool)`

GetCacheControlOk returns a tuple with the CacheControl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCacheControl

`func (o *ResponsesInputItem) SetCacheControl(v CacheControl)`

SetCacheControl sets CacheControl field to given value.

### HasCacheControl

`func (o *ResponsesInputItem) HasCacheControl() bool`

HasCacheControl returns a boolean if a field has been set.

### GetImageUrl

`func (o *ResponsesInputItem) GetImageUrl() InputImageContentPartImageUrl`

GetImageUrl returns the ImageUrl field if non-nil, zero value otherwise.

### GetImageUrlOk

`func (o *ResponsesInputItem) GetImageUrlOk() (*InputImageContentPartImageUrl, bool)`

GetImageUrlOk returns a tuple with the ImageUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetImageUrl

`func (o *ResponsesInputItem) SetImageUrl(v InputImageContentPartImageUrl)`

SetImageUrl sets ImageUrl field to given value.


### GetDetail

`func (o *ResponsesInputItem) GetDetail() string`

GetDetail returns the Detail field if non-nil, zero value otherwise.

### GetDetailOk

`func (o *ResponsesInputItem) GetDetailOk() (*string, bool)`

GetDetailOk returns a tuple with the Detail field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDetail

`func (o *ResponsesInputItem) SetDetail(v string)`

SetDetail sets Detail field to given value.

### HasDetail

`func (o *ResponsesInputItem) HasDetail() bool`

HasDetail returns a boolean if a field has been set.

### GetInputAudio

`func (o *ResponsesInputItem) GetInputAudio() AudioContentPartInputAudio`

GetInputAudio returns the InputAudio field if non-nil, zero value otherwise.

### GetInputAudioOk

`func (o *ResponsesInputItem) GetInputAudioOk() (*AudioContentPartInputAudio, bool)`

GetInputAudioOk returns a tuple with the InputAudio field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputAudio

`func (o *ResponsesInputItem) SetInputAudio(v AudioContentPartInputAudio)`

SetInputAudio sets InputAudio field to given value.


### GetVideoUrl

`func (o *ResponsesInputItem) GetVideoUrl() string`

GetVideoUrl returns the VideoUrl field if non-nil, zero value otherwise.

### GetVideoUrlOk

`func (o *ResponsesInputItem) GetVideoUrlOk() (*string, bool)`

GetVideoUrlOk returns a tuple with the VideoUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetVideoUrl

`func (o *ResponsesInputItem) SetVideoUrl(v string)`

SetVideoUrl sets VideoUrl field to given value.


### GetRole

`func (o *ResponsesInputItem) GetRole() string`

GetRole returns the Role field if non-nil, zero value otherwise.

### GetRoleOk

`func (o *ResponsesInputItem) GetRoleOk() (*string, bool)`

GetRoleOk returns a tuple with the Role field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRole

`func (o *ResponsesInputItem) SetRole(v string)`

SetRole sets Role field to given value.


### GetContent

`func (o *ResponsesInputItem) GetContent() ChatMessageContent`

GetContent returns the Content field if non-nil, zero value otherwise.

### GetContentOk

`func (o *ResponsesInputItem) GetContentOk() (*ChatMessageContent, bool)`

GetContentOk returns a tuple with the Content field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContent

`func (o *ResponsesInputItem) SetContent(v ChatMessageContent)`

SetContent sets Content field to given value.


### GetToolCalls

`func (o *ResponsesInputItem) GetToolCalls() []ToolCall`

GetToolCalls returns the ToolCalls field if non-nil, zero value otherwise.

### GetToolCallsOk

`func (o *ResponsesInputItem) GetToolCallsOk() (*[]ToolCall, bool)`

GetToolCallsOk returns a tuple with the ToolCalls field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetToolCalls

`func (o *ResponsesInputItem) SetToolCalls(v []ToolCall)`

SetToolCalls sets ToolCalls field to given value.

### HasToolCalls

`func (o *ResponsesInputItem) HasToolCalls() bool`

HasToolCalls returns a boolean if a field has been set.

### GetToolCallId

`func (o *ResponsesInputItem) GetToolCallId() string`

GetToolCallId returns the ToolCallId field if non-nil, zero value otherwise.

### GetToolCallIdOk

`func (o *ResponsesInputItem) GetToolCallIdOk() (*string, bool)`

GetToolCallIdOk returns a tuple with the ToolCallId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetToolCallId

`func (o *ResponsesInputItem) SetToolCallId(v string)`

SetToolCallId sets ToolCallId field to given value.

### HasToolCallId

`func (o *ResponsesInputItem) HasToolCallId() bool`

HasToolCallId returns a boolean if a field has been set.

### GetCallId

`func (o *ResponsesInputItem) GetCallId() string`

GetCallId returns the CallId field if non-nil, zero value otherwise.

### GetCallIdOk

`func (o *ResponsesInputItem) GetCallIdOk() (*string, bool)`

GetCallIdOk returns a tuple with the CallId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCallId

`func (o *ResponsesInputItem) SetCallId(v string)`

SetCallId sets CallId field to given value.


### GetName

`func (o *ResponsesInputItem) GetName() string`

GetName returns the Name field if non-nil, zero value otherwise.

### GetNameOk

`func (o *ResponsesInputItem) GetNameOk() (*string, bool)`

GetNameOk returns a tuple with the Name field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetName

`func (o *ResponsesInputItem) SetName(v string)`

SetName sets Name field to given value.


### GetArguments

`func (o *ResponsesInputItem) GetArguments() string`

GetArguments returns the Arguments field if non-nil, zero value otherwise.

### GetArgumentsOk

`func (o *ResponsesInputItem) GetArgumentsOk() (*string, bool)`

GetArgumentsOk returns a tuple with the Arguments field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetArguments

`func (o *ResponsesInputItem) SetArguments(v string)`

SetArguments sets Arguments field to given value.


### GetOutput

`func (o *ResponsesInputItem) GetOutput() string`

GetOutput returns the Output field if non-nil, zero value otherwise.

### GetOutputOk

`func (o *ResponsesInputItem) GetOutputOk() (*string, bool)`

GetOutputOk returns a tuple with the Output field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOutput

`func (o *ResponsesInputItem) SetOutput(v string)`

SetOutput sets Output field to given value.



[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


