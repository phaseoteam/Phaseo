# ActivityEntry

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**RequestId** | Pointer to **string** |  | [optional] 
**Provider** | Pointer to **string** |  | [optional] 
**Model** | Pointer to **string** |  | [optional] 
**Endpoint** | Pointer to **string** |  | [optional] 
**Usage** | Pointer to [**ActivityEntryUsage**](ActivityEntryUsage.md) |  | [optional] 
**CostCents** | Pointer to **float32** |  | [optional] 
**LatencyMs** | Pointer to **int32** |  | [optional] 
**Timestamp** | Pointer to **time.Time** |  | [optional] 

## Methods

### NewActivityEntry

`func NewActivityEntry() *ActivityEntry`

NewActivityEntry instantiates a new ActivityEntry object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewActivityEntryWithDefaults

`func NewActivityEntryWithDefaults() *ActivityEntry`

NewActivityEntryWithDefaults instantiates a new ActivityEntry object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetRequestId

`func (o *ActivityEntry) GetRequestId() string`

GetRequestId returns the RequestId field if non-nil, zero value otherwise.

### GetRequestIdOk

`func (o *ActivityEntry) GetRequestIdOk() (*string, bool)`

GetRequestIdOk returns a tuple with the RequestId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRequestId

`func (o *ActivityEntry) SetRequestId(v string)`

SetRequestId sets RequestId field to given value.

### HasRequestId

`func (o *ActivityEntry) HasRequestId() bool`

HasRequestId returns a boolean if a field has been set.

### GetProvider

`func (o *ActivityEntry) GetProvider() string`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *ActivityEntry) GetProviderOk() (*string, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *ActivityEntry) SetProvider(v string)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *ActivityEntry) HasProvider() bool`

HasProvider returns a boolean if a field has been set.

### GetModel

`func (o *ActivityEntry) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *ActivityEntry) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *ActivityEntry) SetModel(v string)`

SetModel sets Model field to given value.

### HasModel

`func (o *ActivityEntry) HasModel() bool`

HasModel returns a boolean if a field has been set.

### GetEndpoint

`func (o *ActivityEntry) GetEndpoint() string`

GetEndpoint returns the Endpoint field if non-nil, zero value otherwise.

### GetEndpointOk

`func (o *ActivityEntry) GetEndpointOk() (*string, bool)`

GetEndpointOk returns a tuple with the Endpoint field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEndpoint

`func (o *ActivityEntry) SetEndpoint(v string)`

SetEndpoint sets Endpoint field to given value.

### HasEndpoint

`func (o *ActivityEntry) HasEndpoint() bool`

HasEndpoint returns a boolean if a field has been set.

### GetUsage

`func (o *ActivityEntry) GetUsage() ActivityEntryUsage`

GetUsage returns the Usage field if non-nil, zero value otherwise.

### GetUsageOk

`func (o *ActivityEntry) GetUsageOk() (*ActivityEntryUsage, bool)`

GetUsageOk returns a tuple with the Usage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUsage

`func (o *ActivityEntry) SetUsage(v ActivityEntryUsage)`

SetUsage sets Usage field to given value.

### HasUsage

`func (o *ActivityEntry) HasUsage() bool`

HasUsage returns a boolean if a field has been set.

### GetCostCents

`func (o *ActivityEntry) GetCostCents() float32`

GetCostCents returns the CostCents field if non-nil, zero value otherwise.

### GetCostCentsOk

`func (o *ActivityEntry) GetCostCentsOk() (*float32, bool)`

GetCostCentsOk returns a tuple with the CostCents field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCostCents

`func (o *ActivityEntry) SetCostCents(v float32)`

SetCostCents sets CostCents field to given value.

### HasCostCents

`func (o *ActivityEntry) HasCostCents() bool`

HasCostCents returns a boolean if a field has been set.

### GetLatencyMs

`func (o *ActivityEntry) GetLatencyMs() int32`

GetLatencyMs returns the LatencyMs field if non-nil, zero value otherwise.

### GetLatencyMsOk

`func (o *ActivityEntry) GetLatencyMsOk() (*int32, bool)`

GetLatencyMsOk returns a tuple with the LatencyMs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLatencyMs

`func (o *ActivityEntry) SetLatencyMs(v int32)`

SetLatencyMs sets LatencyMs field to given value.

### HasLatencyMs

`func (o *ActivityEntry) HasLatencyMs() bool`

HasLatencyMs returns a boolean if a field has been set.

### GetTimestamp

`func (o *ActivityEntry) GetTimestamp() time.Time`

GetTimestamp returns the Timestamp field if non-nil, zero value otherwise.

### GetTimestampOk

`func (o *ActivityEntry) GetTimestampOk() (*time.Time, bool)`

GetTimestampOk returns a tuple with the Timestamp field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTimestamp

`func (o *ActivityEntry) SetTimestamp(v time.Time)`

SetTimestamp sets Timestamp field to given value.

### HasTimestamp

`func (o *ActivityEntry) HasTimestamp() bool`

HasTimestamp returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


