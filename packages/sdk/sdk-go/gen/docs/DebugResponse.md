# DebugResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Enabled** | Pointer to **bool** |  | [optional] 
**ReturnUpstreamRequest** | Pointer to **bool** |  | [optional] 
**ReturnUpstreamResponse** | Pointer to **bool** |  | [optional] 
**TraceLevel** | Pointer to **string** |  | [optional] 
**Trace** | Pointer to **[]map[string]interface{}** |  | [optional] 

## Methods

### NewDebugResponse

`func NewDebugResponse() *DebugResponse`

NewDebugResponse instantiates a new DebugResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewDebugResponseWithDefaults

`func NewDebugResponseWithDefaults() *DebugResponse`

NewDebugResponseWithDefaults instantiates a new DebugResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetEnabled

`func (o *DebugResponse) GetEnabled() bool`

GetEnabled returns the Enabled field if non-nil, zero value otherwise.

### GetEnabledOk

`func (o *DebugResponse) GetEnabledOk() (*bool, bool)`

GetEnabledOk returns a tuple with the Enabled field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEnabled

`func (o *DebugResponse) SetEnabled(v bool)`

SetEnabled sets Enabled field to given value.

### HasEnabled

`func (o *DebugResponse) HasEnabled() bool`

HasEnabled returns a boolean if a field has been set.

### GetReturnUpstreamRequest

`func (o *DebugResponse) GetReturnUpstreamRequest() bool`

GetReturnUpstreamRequest returns the ReturnUpstreamRequest field if non-nil, zero value otherwise.

### GetReturnUpstreamRequestOk

`func (o *DebugResponse) GetReturnUpstreamRequestOk() (*bool, bool)`

GetReturnUpstreamRequestOk returns a tuple with the ReturnUpstreamRequest field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReturnUpstreamRequest

`func (o *DebugResponse) SetReturnUpstreamRequest(v bool)`

SetReturnUpstreamRequest sets ReturnUpstreamRequest field to given value.

### HasReturnUpstreamRequest

`func (o *DebugResponse) HasReturnUpstreamRequest() bool`

HasReturnUpstreamRequest returns a boolean if a field has been set.

### GetReturnUpstreamResponse

`func (o *DebugResponse) GetReturnUpstreamResponse() bool`

GetReturnUpstreamResponse returns the ReturnUpstreamResponse field if non-nil, zero value otherwise.

### GetReturnUpstreamResponseOk

`func (o *DebugResponse) GetReturnUpstreamResponseOk() (*bool, bool)`

GetReturnUpstreamResponseOk returns a tuple with the ReturnUpstreamResponse field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReturnUpstreamResponse

`func (o *DebugResponse) SetReturnUpstreamResponse(v bool)`

SetReturnUpstreamResponse sets ReturnUpstreamResponse field to given value.

### HasReturnUpstreamResponse

`func (o *DebugResponse) HasReturnUpstreamResponse() bool`

HasReturnUpstreamResponse returns a boolean if a field has been set.

### GetTraceLevel

`func (o *DebugResponse) GetTraceLevel() string`

GetTraceLevel returns the TraceLevel field if non-nil, zero value otherwise.

### GetTraceLevelOk

`func (o *DebugResponse) GetTraceLevelOk() (*string, bool)`

GetTraceLevelOk returns a tuple with the TraceLevel field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTraceLevel

`func (o *DebugResponse) SetTraceLevel(v string)`

SetTraceLevel sets TraceLevel field to given value.

### HasTraceLevel

`func (o *DebugResponse) HasTraceLevel() bool`

HasTraceLevel returns a boolean if a field has been set.

### GetTrace

`func (o *DebugResponse) GetTrace() []map[string]interface{}`

GetTrace returns the Trace field if non-nil, zero value otherwise.

### GetTraceOk

`func (o *DebugResponse) GetTraceOk() (*[]map[string]interface{}, bool)`

GetTraceOk returns a tuple with the Trace field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTrace

`func (o *DebugResponse) SetTrace(v []map[string]interface{})`

SetTrace sets Trace field to given value.

### HasTrace

`func (o *DebugResponse) HasTrace() bool`

HasTrace returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


