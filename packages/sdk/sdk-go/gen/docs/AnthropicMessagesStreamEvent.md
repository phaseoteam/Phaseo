# AnthropicMessagesStreamEvent

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Event** | Pointer to **string** |  | [optional] 
**Data** | Pointer to **map[string]interface{}** |  | [optional] 

## Methods

### NewAnthropicMessagesStreamEvent

`func NewAnthropicMessagesStreamEvent() *AnthropicMessagesStreamEvent`

NewAnthropicMessagesStreamEvent instantiates a new AnthropicMessagesStreamEvent object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewAnthropicMessagesStreamEventWithDefaults

`func NewAnthropicMessagesStreamEventWithDefaults() *AnthropicMessagesStreamEvent`

NewAnthropicMessagesStreamEventWithDefaults instantiates a new AnthropicMessagesStreamEvent object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetEvent

`func (o *AnthropicMessagesStreamEvent) GetEvent() string`

GetEvent returns the Event field if non-nil, zero value otherwise.

### GetEventOk

`func (o *AnthropicMessagesStreamEvent) GetEventOk() (*string, bool)`

GetEventOk returns a tuple with the Event field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEvent

`func (o *AnthropicMessagesStreamEvent) SetEvent(v string)`

SetEvent sets Event field to given value.

### HasEvent

`func (o *AnthropicMessagesStreamEvent) HasEvent() bool`

HasEvent returns a boolean if a field has been set.

### GetData

`func (o *AnthropicMessagesStreamEvent) GetData() map[string]interface{}`

GetData returns the Data field if non-nil, zero value otherwise.

### GetDataOk

`func (o *AnthropicMessagesStreamEvent) GetDataOk() (*map[string]interface{}, bool)`

GetDataOk returns a tuple with the Data field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetData

`func (o *AnthropicMessagesStreamEvent) SetData(v map[string]interface{})`

SetData sets Data field to given value.

### HasData

`func (o *AnthropicMessagesStreamEvent) HasData() bool`

HasData returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


