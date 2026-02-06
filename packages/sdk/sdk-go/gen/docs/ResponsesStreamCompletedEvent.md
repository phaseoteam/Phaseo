# ResponsesStreamCompletedEvent

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Event** | Pointer to **string** |  | [optional] 
**Data** | Pointer to [**ResponsesStreamCompletedEventData**](ResponsesStreamCompletedEventData.md) |  | [optional] 

## Methods

### NewResponsesStreamCompletedEvent

`func NewResponsesStreamCompletedEvent() *ResponsesStreamCompletedEvent`

NewResponsesStreamCompletedEvent instantiates a new ResponsesStreamCompletedEvent object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewResponsesStreamCompletedEventWithDefaults

`func NewResponsesStreamCompletedEventWithDefaults() *ResponsesStreamCompletedEvent`

NewResponsesStreamCompletedEventWithDefaults instantiates a new ResponsesStreamCompletedEvent object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetEvent

`func (o *ResponsesStreamCompletedEvent) GetEvent() string`

GetEvent returns the Event field if non-nil, zero value otherwise.

### GetEventOk

`func (o *ResponsesStreamCompletedEvent) GetEventOk() (*string, bool)`

GetEventOk returns a tuple with the Event field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEvent

`func (o *ResponsesStreamCompletedEvent) SetEvent(v string)`

SetEvent sets Event field to given value.

### HasEvent

`func (o *ResponsesStreamCompletedEvent) HasEvent() bool`

HasEvent returns a boolean if a field has been set.

### GetData

`func (o *ResponsesStreamCompletedEvent) GetData() ResponsesStreamCompletedEventData`

GetData returns the Data field if non-nil, zero value otherwise.

### GetDataOk

`func (o *ResponsesStreamCompletedEvent) GetDataOk() (*ResponsesStreamCompletedEventData, bool)`

GetDataOk returns a tuple with the Data field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetData

`func (o *ResponsesStreamCompletedEvent) SetData(v ResponsesStreamCompletedEventData)`

SetData sets Data field to given value.

### HasData

`func (o *ResponsesStreamCompletedEvent) HasData() bool`

HasData returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


