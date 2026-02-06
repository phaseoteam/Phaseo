# AnthropicMessageStartEvent

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Event** | Pointer to **string** |  | [optional] 
**Data** | Pointer to [**AnthropicMessageStartEventData**](AnthropicMessageStartEventData.md) |  | [optional] 

## Methods

### NewAnthropicMessageStartEvent

`func NewAnthropicMessageStartEvent() *AnthropicMessageStartEvent`

NewAnthropicMessageStartEvent instantiates a new AnthropicMessageStartEvent object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewAnthropicMessageStartEventWithDefaults

`func NewAnthropicMessageStartEventWithDefaults() *AnthropicMessageStartEvent`

NewAnthropicMessageStartEventWithDefaults instantiates a new AnthropicMessageStartEvent object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetEvent

`func (o *AnthropicMessageStartEvent) GetEvent() string`

GetEvent returns the Event field if non-nil, zero value otherwise.

### GetEventOk

`func (o *AnthropicMessageStartEvent) GetEventOk() (*string, bool)`

GetEventOk returns a tuple with the Event field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEvent

`func (o *AnthropicMessageStartEvent) SetEvent(v string)`

SetEvent sets Event field to given value.

### HasEvent

`func (o *AnthropicMessageStartEvent) HasEvent() bool`

HasEvent returns a boolean if a field has been set.

### GetData

`func (o *AnthropicMessageStartEvent) GetData() AnthropicMessageStartEventData`

GetData returns the Data field if non-nil, zero value otherwise.

### GetDataOk

`func (o *AnthropicMessageStartEvent) GetDataOk() (*AnthropicMessageStartEventData, bool)`

GetDataOk returns a tuple with the Data field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetData

`func (o *AnthropicMessageStartEvent) SetData(v AnthropicMessageStartEventData)`

SetData sets Data field to given value.

### HasData

`func (o *AnthropicMessageStartEvent) HasData() bool`

HasData returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


