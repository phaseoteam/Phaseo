# ResponsesMessageItem

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Type** | **string** |  | 
**Role** | **string** |  | 
**Content** | [**ChatMessageContent**](ChatMessageContent.md) |  | 
**ToolCalls** | Pointer to [**[]ToolCall**](ToolCall.md) |  | [optional] 
**ToolCallId** | Pointer to **string** |  | [optional] 

## Methods

### NewResponsesMessageItem

`func NewResponsesMessageItem(type_ string, role string, content ChatMessageContent, ) *ResponsesMessageItem`

NewResponsesMessageItem instantiates a new ResponsesMessageItem object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewResponsesMessageItemWithDefaults

`func NewResponsesMessageItemWithDefaults() *ResponsesMessageItem`

NewResponsesMessageItemWithDefaults instantiates a new ResponsesMessageItem object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetType

`func (o *ResponsesMessageItem) GetType() string`

GetType returns the Type field if non-nil, zero value otherwise.

### GetTypeOk

`func (o *ResponsesMessageItem) GetTypeOk() (*string, bool)`

GetTypeOk returns a tuple with the Type field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetType

`func (o *ResponsesMessageItem) SetType(v string)`

SetType sets Type field to given value.


### GetRole

`func (o *ResponsesMessageItem) GetRole() string`

GetRole returns the Role field if non-nil, zero value otherwise.

### GetRoleOk

`func (o *ResponsesMessageItem) GetRoleOk() (*string, bool)`

GetRoleOk returns a tuple with the Role field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRole

`func (o *ResponsesMessageItem) SetRole(v string)`

SetRole sets Role field to given value.


### GetContent

`func (o *ResponsesMessageItem) GetContent() ChatMessageContent`

GetContent returns the Content field if non-nil, zero value otherwise.

### GetContentOk

`func (o *ResponsesMessageItem) GetContentOk() (*ChatMessageContent, bool)`

GetContentOk returns a tuple with the Content field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContent

`func (o *ResponsesMessageItem) SetContent(v ChatMessageContent)`

SetContent sets Content field to given value.


### GetToolCalls

`func (o *ResponsesMessageItem) GetToolCalls() []ToolCall`

GetToolCalls returns the ToolCalls field if non-nil, zero value otherwise.

### GetToolCallsOk

`func (o *ResponsesMessageItem) GetToolCallsOk() (*[]ToolCall, bool)`

GetToolCallsOk returns a tuple with the ToolCalls field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetToolCalls

`func (o *ResponsesMessageItem) SetToolCalls(v []ToolCall)`

SetToolCalls sets ToolCalls field to given value.

### HasToolCalls

`func (o *ResponsesMessageItem) HasToolCalls() bool`

HasToolCalls returns a boolean if a field has been set.

### GetToolCallId

`func (o *ResponsesMessageItem) GetToolCallId() string`

GetToolCallId returns the ToolCallId field if non-nil, zero value otherwise.

### GetToolCallIdOk

`func (o *ResponsesMessageItem) GetToolCallIdOk() (*string, bool)`

GetToolCallIdOk returns a tuple with the ToolCallId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetToolCallId

`func (o *ResponsesMessageItem) SetToolCallId(v string)`

SetToolCallId sets ToolCallId field to given value.

### HasToolCallId

`func (o *ResponsesMessageItem) HasToolCallId() bool`

HasToolCallId returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


