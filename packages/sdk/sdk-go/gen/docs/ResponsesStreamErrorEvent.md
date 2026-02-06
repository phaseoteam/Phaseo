# ResponsesStreamErrorEvent

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Event** | Pointer to **string** |  | [optional] 
**Data** | Pointer to **map[string]interface{}** |  | [optional] 

## Methods

### NewResponsesStreamErrorEvent

`func NewResponsesStreamErrorEvent() *ResponsesStreamErrorEvent`

NewResponsesStreamErrorEvent instantiates a new ResponsesStreamErrorEvent object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewResponsesStreamErrorEventWithDefaults

`func NewResponsesStreamErrorEventWithDefaults() *ResponsesStreamErrorEvent`

NewResponsesStreamErrorEventWithDefaults instantiates a new ResponsesStreamErrorEvent object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetEvent

`func (o *ResponsesStreamErrorEvent) GetEvent() string`

GetEvent returns the Event field if non-nil, zero value otherwise.

### GetEventOk

`func (o *ResponsesStreamErrorEvent) GetEventOk() (*string, bool)`

GetEventOk returns a tuple with the Event field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEvent

`func (o *ResponsesStreamErrorEvent) SetEvent(v string)`

SetEvent sets Event field to given value.

### HasEvent

`func (o *ResponsesStreamErrorEvent) HasEvent() bool`

HasEvent returns a boolean if a field has been set.

### GetData

`func (o *ResponsesStreamErrorEvent) GetData() map[string]interface{}`

GetData returns the Data field if non-nil, zero value otherwise.

### GetDataOk

`func (o *ResponsesStreamErrorEvent) GetDataOk() (*map[string]interface{}, bool)`

GetDataOk returns a tuple with the Data field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetData

`func (o *ResponsesStreamErrorEvent) SetData(v map[string]interface{})`

SetData sets Data field to given value.

### HasData

`func (o *ResponsesStreamErrorEvent) HasData() bool`

HasData returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


