# AnthropicMessageDeltaEventData

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Delta** | Pointer to **map[string]interface{}** |  | [optional] 
**Usage** | Pointer to [**AnthropicUsage**](AnthropicUsage.md) |  | [optional] 

## Methods

### NewAnthropicMessageDeltaEventData

`func NewAnthropicMessageDeltaEventData() *AnthropicMessageDeltaEventData`

NewAnthropicMessageDeltaEventData instantiates a new AnthropicMessageDeltaEventData object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewAnthropicMessageDeltaEventDataWithDefaults

`func NewAnthropicMessageDeltaEventDataWithDefaults() *AnthropicMessageDeltaEventData`

NewAnthropicMessageDeltaEventDataWithDefaults instantiates a new AnthropicMessageDeltaEventData object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetDelta

`func (o *AnthropicMessageDeltaEventData) GetDelta() map[string]interface{}`

GetDelta returns the Delta field if non-nil, zero value otherwise.

### GetDeltaOk

`func (o *AnthropicMessageDeltaEventData) GetDeltaOk() (*map[string]interface{}, bool)`

GetDeltaOk returns a tuple with the Delta field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDelta

`func (o *AnthropicMessageDeltaEventData) SetDelta(v map[string]interface{})`

SetDelta sets Delta field to given value.

### HasDelta

`func (o *AnthropicMessageDeltaEventData) HasDelta() bool`

HasDelta returns a boolean if a field has been set.

### GetUsage

`func (o *AnthropicMessageDeltaEventData) GetUsage() AnthropicUsage`

GetUsage returns the Usage field if non-nil, zero value otherwise.

### GetUsageOk

`func (o *AnthropicMessageDeltaEventData) GetUsageOk() (*AnthropicUsage, bool)`

GetUsageOk returns a tuple with the Usage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUsage

`func (o *AnthropicMessageDeltaEventData) SetUsage(v AnthropicUsage)`

SetUsage sets Usage field to given value.

### HasUsage

`func (o *AnthropicMessageDeltaEventData) HasUsage() bool`

HasUsage returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


