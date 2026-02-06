# ResponsesStreamOutputTextDeltaEventData

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Delta** | Pointer to **string** |  | [optional] 
**OutputIndex** | Pointer to **int32** |  | [optional] 
**ItemId** | Pointer to **string** |  | [optional] 
**Logprobs** | Pointer to **map[string]interface{}** |  | [optional] 

## Methods

### NewResponsesStreamOutputTextDeltaEventData

`func NewResponsesStreamOutputTextDeltaEventData() *ResponsesStreamOutputTextDeltaEventData`

NewResponsesStreamOutputTextDeltaEventData instantiates a new ResponsesStreamOutputTextDeltaEventData object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewResponsesStreamOutputTextDeltaEventDataWithDefaults

`func NewResponsesStreamOutputTextDeltaEventDataWithDefaults() *ResponsesStreamOutputTextDeltaEventData`

NewResponsesStreamOutputTextDeltaEventDataWithDefaults instantiates a new ResponsesStreamOutputTextDeltaEventData object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetDelta

`func (o *ResponsesStreamOutputTextDeltaEventData) GetDelta() string`

GetDelta returns the Delta field if non-nil, zero value otherwise.

### GetDeltaOk

`func (o *ResponsesStreamOutputTextDeltaEventData) GetDeltaOk() (*string, bool)`

GetDeltaOk returns a tuple with the Delta field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDelta

`func (o *ResponsesStreamOutputTextDeltaEventData) SetDelta(v string)`

SetDelta sets Delta field to given value.

### HasDelta

`func (o *ResponsesStreamOutputTextDeltaEventData) HasDelta() bool`

HasDelta returns a boolean if a field has been set.

### GetOutputIndex

`func (o *ResponsesStreamOutputTextDeltaEventData) GetOutputIndex() int32`

GetOutputIndex returns the OutputIndex field if non-nil, zero value otherwise.

### GetOutputIndexOk

`func (o *ResponsesStreamOutputTextDeltaEventData) GetOutputIndexOk() (*int32, bool)`

GetOutputIndexOk returns a tuple with the OutputIndex field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOutputIndex

`func (o *ResponsesStreamOutputTextDeltaEventData) SetOutputIndex(v int32)`

SetOutputIndex sets OutputIndex field to given value.

### HasOutputIndex

`func (o *ResponsesStreamOutputTextDeltaEventData) HasOutputIndex() bool`

HasOutputIndex returns a boolean if a field has been set.

### GetItemId

`func (o *ResponsesStreamOutputTextDeltaEventData) GetItemId() string`

GetItemId returns the ItemId field if non-nil, zero value otherwise.

### GetItemIdOk

`func (o *ResponsesStreamOutputTextDeltaEventData) GetItemIdOk() (*string, bool)`

GetItemIdOk returns a tuple with the ItemId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetItemId

`func (o *ResponsesStreamOutputTextDeltaEventData) SetItemId(v string)`

SetItemId sets ItemId field to given value.

### HasItemId

`func (o *ResponsesStreamOutputTextDeltaEventData) HasItemId() bool`

HasItemId returns a boolean if a field has been set.

### GetLogprobs

`func (o *ResponsesStreamOutputTextDeltaEventData) GetLogprobs() map[string]interface{}`

GetLogprobs returns the Logprobs field if non-nil, zero value otherwise.

### GetLogprobsOk

`func (o *ResponsesStreamOutputTextDeltaEventData) GetLogprobsOk() (*map[string]interface{}, bool)`

GetLogprobsOk returns a tuple with the Logprobs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLogprobs

`func (o *ResponsesStreamOutputTextDeltaEventData) SetLogprobs(v map[string]interface{})`

SetLogprobs sets Logprobs field to given value.

### HasLogprobs

`func (o *ResponsesStreamOutputTextDeltaEventData) HasLogprobs() bool`

HasLogprobs returns a boolean if a field has been set.

### SetLogprobsNil

`func (o *ResponsesStreamOutputTextDeltaEventData) SetLogprobsNil(b bool)`

 SetLogprobsNil sets the value for Logprobs to be an explicit nil

### UnsetLogprobs
`func (o *ResponsesStreamOutputTextDeltaEventData) UnsetLogprobs()`

UnsetLogprobs ensures that no value is present for Logprobs, not even an explicit nil

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


