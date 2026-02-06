# ChatCompletionsStreamEvent

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Event** | Pointer to **NullableString** |  | [optional] 
**Data** | Pointer to [**ChatCompletionsStreamChunk**](ChatCompletionsStreamChunk.md) |  | [optional] 

## Methods

### NewChatCompletionsStreamEvent

`func NewChatCompletionsStreamEvent() *ChatCompletionsStreamEvent`

NewChatCompletionsStreamEvent instantiates a new ChatCompletionsStreamEvent object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewChatCompletionsStreamEventWithDefaults

`func NewChatCompletionsStreamEventWithDefaults() *ChatCompletionsStreamEvent`

NewChatCompletionsStreamEventWithDefaults instantiates a new ChatCompletionsStreamEvent object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetEvent

`func (o *ChatCompletionsStreamEvent) GetEvent() string`

GetEvent returns the Event field if non-nil, zero value otherwise.

### GetEventOk

`func (o *ChatCompletionsStreamEvent) GetEventOk() (*string, bool)`

GetEventOk returns a tuple with the Event field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEvent

`func (o *ChatCompletionsStreamEvent) SetEvent(v string)`

SetEvent sets Event field to given value.

### HasEvent

`func (o *ChatCompletionsStreamEvent) HasEvent() bool`

HasEvent returns a boolean if a field has been set.

### SetEventNil

`func (o *ChatCompletionsStreamEvent) SetEventNil(b bool)`

 SetEventNil sets the value for Event to be an explicit nil

### UnsetEvent
`func (o *ChatCompletionsStreamEvent) UnsetEvent()`

UnsetEvent ensures that no value is present for Event, not even an explicit nil
### GetData

`func (o *ChatCompletionsStreamEvent) GetData() ChatCompletionsStreamChunk`

GetData returns the Data field if non-nil, zero value otherwise.

### GetDataOk

`func (o *ChatCompletionsStreamEvent) GetDataOk() (*ChatCompletionsStreamChunk, bool)`

GetDataOk returns a tuple with the Data field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetData

`func (o *ChatCompletionsStreamEvent) SetData(v ChatCompletionsStreamChunk)`

SetData sets Data field to given value.

### HasData

`func (o *ChatCompletionsStreamEvent) HasData() bool`

HasData returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


