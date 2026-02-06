# ResponsesStreamCreatedEvent

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Event** | Pointer to **string** |  | [optional] 
**Data** | Pointer to [**ResponsesStreamCreatedEventData**](ResponsesStreamCreatedEventData.md) |  | [optional] 

## Methods

### NewResponsesStreamCreatedEvent

`func NewResponsesStreamCreatedEvent() *ResponsesStreamCreatedEvent`

NewResponsesStreamCreatedEvent instantiates a new ResponsesStreamCreatedEvent object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewResponsesStreamCreatedEventWithDefaults

`func NewResponsesStreamCreatedEventWithDefaults() *ResponsesStreamCreatedEvent`

NewResponsesStreamCreatedEventWithDefaults instantiates a new ResponsesStreamCreatedEvent object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetEvent

`func (o *ResponsesStreamCreatedEvent) GetEvent() string`

GetEvent returns the Event field if non-nil, zero value otherwise.

### GetEventOk

`func (o *ResponsesStreamCreatedEvent) GetEventOk() (*string, bool)`

GetEventOk returns a tuple with the Event field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEvent

`func (o *ResponsesStreamCreatedEvent) SetEvent(v string)`

SetEvent sets Event field to given value.

### HasEvent

`func (o *ResponsesStreamCreatedEvent) HasEvent() bool`

HasEvent returns a boolean if a field has been set.

### GetData

`func (o *ResponsesStreamCreatedEvent) GetData() ResponsesStreamCreatedEventData`

GetData returns the Data field if non-nil, zero value otherwise.

### GetDataOk

`func (o *ResponsesStreamCreatedEvent) GetDataOk() (*ResponsesStreamCreatedEventData, bool)`

GetDataOk returns a tuple with the Data field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetData

`func (o *ResponsesStreamCreatedEvent) SetData(v ResponsesStreamCreatedEventData)`

SetData sets Data field to given value.

### HasData

`func (o *ResponsesStreamCreatedEvent) HasData() bool`

HasData returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


