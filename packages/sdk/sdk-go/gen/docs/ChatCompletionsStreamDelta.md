# ChatCompletionsStreamDelta

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Role** | Pointer to **string** |  | [optional] 
**Content** | Pointer to **string** |  | [optional] 
**ReasoningContent** | Pointer to **string** |  | [optional] 
**ToolCalls** | Pointer to **[]map[string]interface{}** |  | [optional] 

## Methods

### NewChatCompletionsStreamDelta

`func NewChatCompletionsStreamDelta() *ChatCompletionsStreamDelta`

NewChatCompletionsStreamDelta instantiates a new ChatCompletionsStreamDelta object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewChatCompletionsStreamDeltaWithDefaults

`func NewChatCompletionsStreamDeltaWithDefaults() *ChatCompletionsStreamDelta`

NewChatCompletionsStreamDeltaWithDefaults instantiates a new ChatCompletionsStreamDelta object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetRole

`func (o *ChatCompletionsStreamDelta) GetRole() string`

GetRole returns the Role field if non-nil, zero value otherwise.

### GetRoleOk

`func (o *ChatCompletionsStreamDelta) GetRoleOk() (*string, bool)`

GetRoleOk returns a tuple with the Role field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRole

`func (o *ChatCompletionsStreamDelta) SetRole(v string)`

SetRole sets Role field to given value.

### HasRole

`func (o *ChatCompletionsStreamDelta) HasRole() bool`

HasRole returns a boolean if a field has been set.

### GetContent

`func (o *ChatCompletionsStreamDelta) GetContent() string`

GetContent returns the Content field if non-nil, zero value otherwise.

### GetContentOk

`func (o *ChatCompletionsStreamDelta) GetContentOk() (*string, bool)`

GetContentOk returns a tuple with the Content field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContent

`func (o *ChatCompletionsStreamDelta) SetContent(v string)`

SetContent sets Content field to given value.

### HasContent

`func (o *ChatCompletionsStreamDelta) HasContent() bool`

HasContent returns a boolean if a field has been set.

### GetReasoningContent

`func (o *ChatCompletionsStreamDelta) GetReasoningContent() string`

GetReasoningContent returns the ReasoningContent field if non-nil, zero value otherwise.

### GetReasoningContentOk

`func (o *ChatCompletionsStreamDelta) GetReasoningContentOk() (*string, bool)`

GetReasoningContentOk returns a tuple with the ReasoningContent field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReasoningContent

`func (o *ChatCompletionsStreamDelta) SetReasoningContent(v string)`

SetReasoningContent sets ReasoningContent field to given value.

### HasReasoningContent

`func (o *ChatCompletionsStreamDelta) HasReasoningContent() bool`

HasReasoningContent returns a boolean if a field has been set.

### GetToolCalls

`func (o *ChatCompletionsStreamDelta) GetToolCalls() []map[string]interface{}`

GetToolCalls returns the ToolCalls field if non-nil, zero value otherwise.

### GetToolCallsOk

`func (o *ChatCompletionsStreamDelta) GetToolCallsOk() (*[]map[string]interface{}, bool)`

GetToolCallsOk returns a tuple with the ToolCalls field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetToolCalls

`func (o *ChatCompletionsStreamDelta) SetToolCalls(v []map[string]interface{})`

SetToolCalls sets ToolCalls field to given value.

### HasToolCalls

`func (o *ChatCompletionsStreamDelta) HasToolCalls() bool`

HasToolCalls returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


