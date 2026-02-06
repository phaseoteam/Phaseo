# AnthropicContentBlockStartEvent

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Event** | Pointer to **string** |  | [optional] 
**Data** | Pointer to [**AnthropicContentBlockStartEventData**](AnthropicContentBlockStartEventData.md) |  | [optional] 

## Methods

### NewAnthropicContentBlockStartEvent

`func NewAnthropicContentBlockStartEvent() *AnthropicContentBlockStartEvent`

NewAnthropicContentBlockStartEvent instantiates a new AnthropicContentBlockStartEvent object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewAnthropicContentBlockStartEventWithDefaults

`func NewAnthropicContentBlockStartEventWithDefaults() *AnthropicContentBlockStartEvent`

NewAnthropicContentBlockStartEventWithDefaults instantiates a new AnthropicContentBlockStartEvent object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetEvent

`func (o *AnthropicContentBlockStartEvent) GetEvent() string`

GetEvent returns the Event field if non-nil, zero value otherwise.

### GetEventOk

`func (o *AnthropicContentBlockStartEvent) GetEventOk() (*string, bool)`

GetEventOk returns a tuple with the Event field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEvent

`func (o *AnthropicContentBlockStartEvent) SetEvent(v string)`

SetEvent sets Event field to given value.

### HasEvent

`func (o *AnthropicContentBlockStartEvent) HasEvent() bool`

HasEvent returns a boolean if a field has been set.

### GetData

`func (o *AnthropicContentBlockStartEvent) GetData() AnthropicContentBlockStartEventData`

GetData returns the Data field if non-nil, zero value otherwise.

### GetDataOk

`func (o *AnthropicContentBlockStartEvent) GetDataOk() (*AnthropicContentBlockStartEventData, bool)`

GetDataOk returns a tuple with the Data field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetData

`func (o *AnthropicContentBlockStartEvent) SetData(v AnthropicContentBlockStartEventData)`

SetData sets Data field to given value.

### HasData

`func (o *AnthropicContentBlockStartEvent) HasData() bool`

HasData returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


