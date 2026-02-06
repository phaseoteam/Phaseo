# ChatCompletionsStreamChoice

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Index** | Pointer to **int32** |  | [optional] 
**Delta** | Pointer to [**ChatCompletionsStreamDelta**](ChatCompletionsStreamDelta.md) |  | [optional] 
**FinishReason** | Pointer to **string** |  | [optional] 
**Logprobs** | Pointer to **map[string]interface{}** |  | [optional] 

## Methods

### NewChatCompletionsStreamChoice

`func NewChatCompletionsStreamChoice() *ChatCompletionsStreamChoice`

NewChatCompletionsStreamChoice instantiates a new ChatCompletionsStreamChoice object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewChatCompletionsStreamChoiceWithDefaults

`func NewChatCompletionsStreamChoiceWithDefaults() *ChatCompletionsStreamChoice`

NewChatCompletionsStreamChoiceWithDefaults instantiates a new ChatCompletionsStreamChoice object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetIndex

`func (o *ChatCompletionsStreamChoice) GetIndex() int32`

GetIndex returns the Index field if non-nil, zero value otherwise.

### GetIndexOk

`func (o *ChatCompletionsStreamChoice) GetIndexOk() (*int32, bool)`

GetIndexOk returns a tuple with the Index field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetIndex

`func (o *ChatCompletionsStreamChoice) SetIndex(v int32)`

SetIndex sets Index field to given value.

### HasIndex

`func (o *ChatCompletionsStreamChoice) HasIndex() bool`

HasIndex returns a boolean if a field has been set.

### GetDelta

`func (o *ChatCompletionsStreamChoice) GetDelta() ChatCompletionsStreamDelta`

GetDelta returns the Delta field if non-nil, zero value otherwise.

### GetDeltaOk

`func (o *ChatCompletionsStreamChoice) GetDeltaOk() (*ChatCompletionsStreamDelta, bool)`

GetDeltaOk returns a tuple with the Delta field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDelta

`func (o *ChatCompletionsStreamChoice) SetDelta(v ChatCompletionsStreamDelta)`

SetDelta sets Delta field to given value.

### HasDelta

`func (o *ChatCompletionsStreamChoice) HasDelta() bool`

HasDelta returns a boolean if a field has been set.

### GetFinishReason

`func (o *ChatCompletionsStreamChoice) GetFinishReason() string`

GetFinishReason returns the FinishReason field if non-nil, zero value otherwise.

### GetFinishReasonOk

`func (o *ChatCompletionsStreamChoice) GetFinishReasonOk() (*string, bool)`

GetFinishReasonOk returns a tuple with the FinishReason field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFinishReason

`func (o *ChatCompletionsStreamChoice) SetFinishReason(v string)`

SetFinishReason sets FinishReason field to given value.

### HasFinishReason

`func (o *ChatCompletionsStreamChoice) HasFinishReason() bool`

HasFinishReason returns a boolean if a field has been set.

### GetLogprobs

`func (o *ChatCompletionsStreamChoice) GetLogprobs() map[string]interface{}`

GetLogprobs returns the Logprobs field if non-nil, zero value otherwise.

### GetLogprobsOk

`func (o *ChatCompletionsStreamChoice) GetLogprobsOk() (*map[string]interface{}, bool)`

GetLogprobsOk returns a tuple with the Logprobs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLogprobs

`func (o *ChatCompletionsStreamChoice) SetLogprobs(v map[string]interface{})`

SetLogprobs sets Logprobs field to given value.

### HasLogprobs

`func (o *ChatCompletionsStreamChoice) HasLogprobs() bool`

HasLogprobs returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


