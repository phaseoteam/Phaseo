# AnthropicMessage

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Role** | **string** |  | 
**Content** | [**AnthropicMessageContent**](AnthropicMessageContent.md) |  | 

## Methods

### NewAnthropicMessage

`func NewAnthropicMessage(role string, content AnthropicMessageContent, ) *AnthropicMessage`

NewAnthropicMessage instantiates a new AnthropicMessage object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewAnthropicMessageWithDefaults

`func NewAnthropicMessageWithDefaults() *AnthropicMessage`

NewAnthropicMessageWithDefaults instantiates a new AnthropicMessage object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetRole

`func (o *AnthropicMessage) GetRole() string`

GetRole returns the Role field if non-nil, zero value otherwise.

### GetRoleOk

`func (o *AnthropicMessage) GetRoleOk() (*string, bool)`

GetRoleOk returns a tuple with the Role field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRole

`func (o *AnthropicMessage) SetRole(v string)`

SetRole sets Role field to given value.


### GetContent

`func (o *AnthropicMessage) GetContent() AnthropicMessageContent`

GetContent returns the Content field if non-nil, zero value otherwise.

### GetContentOk

`func (o *AnthropicMessage) GetContentOk() (*AnthropicMessageContent, bool)`

GetContentOk returns a tuple with the Content field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContent

`func (o *AnthropicMessage) SetContent(v AnthropicMessageContent)`

SetContent sets Content field to given value.



[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


