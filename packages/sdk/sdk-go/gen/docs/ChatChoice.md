# ChatChoice

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Index** | Pointer to **int32** |  | [optional] 
**Message** | Pointer to [**ChatMessage**](ChatMessage.md) |  | [optional] 
**FinishReason** | Pointer to **string** |  | [optional] 

## Methods

### NewChatChoice

`func NewChatChoice() *ChatChoice`

NewChatChoice instantiates a new ChatChoice object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewChatChoiceWithDefaults

`func NewChatChoiceWithDefaults() *ChatChoice`

NewChatChoiceWithDefaults instantiates a new ChatChoice object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetIndex

`func (o *ChatChoice) GetIndex() int32`

GetIndex returns the Index field if non-nil, zero value otherwise.

### GetIndexOk

`func (o *ChatChoice) GetIndexOk() (*int32, bool)`

GetIndexOk returns a tuple with the Index field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetIndex

`func (o *ChatChoice) SetIndex(v int32)`

SetIndex sets Index field to given value.

### HasIndex

`func (o *ChatChoice) HasIndex() bool`

HasIndex returns a boolean if a field has been set.

### GetMessage

`func (o *ChatChoice) GetMessage() ChatMessage`

GetMessage returns the Message field if non-nil, zero value otherwise.

### GetMessageOk

`func (o *ChatChoice) GetMessageOk() (*ChatMessage, bool)`

GetMessageOk returns a tuple with the Message field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMessage

`func (o *ChatChoice) SetMessage(v ChatMessage)`

SetMessage sets Message field to given value.

### HasMessage

`func (o *ChatChoice) HasMessage() bool`

HasMessage returns a boolean if a field has been set.

### GetFinishReason

`func (o *ChatChoice) GetFinishReason() string`

GetFinishReason returns the FinishReason field if non-nil, zero value otherwise.

### GetFinishReasonOk

`func (o *ChatChoice) GetFinishReasonOk() (*string, bool)`

GetFinishReasonOk returns a tuple with the FinishReason field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFinishReason

`func (o *ChatChoice) SetFinishReason(v string)`

SetFinishReason sets FinishReason field to given value.

### HasFinishReason

`func (o *ChatChoice) HasFinishReason() bool`

HasFinishReason returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


