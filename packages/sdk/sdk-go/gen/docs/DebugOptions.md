# DebugOptions

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Enabled** | Pointer to **bool** | Enable debug mode for the request. | [optional] 
**ReturnUpstreamRequest** | Pointer to **bool** | Include the upstream request payload in the response. | [optional] 
**ReturnUpstreamResponse** | Pointer to **bool** | Include the upstream response payload in the response. | [optional] 
**Trace** | Pointer to **bool** | Include a redacted field-level mapping trace under response debug.trace. | [optional] 
**TraceLevel** | Pointer to **string** | Controls trace detail level. | [optional] 

## Methods

### NewDebugOptions

`func NewDebugOptions() *DebugOptions`

NewDebugOptions instantiates a new DebugOptions object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewDebugOptionsWithDefaults

`func NewDebugOptionsWithDefaults() *DebugOptions`

NewDebugOptionsWithDefaults instantiates a new DebugOptions object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetEnabled

`func (o *DebugOptions) GetEnabled() bool`

GetEnabled returns the Enabled field if non-nil, zero value otherwise.

### GetEnabledOk

`func (o *DebugOptions) GetEnabledOk() (*bool, bool)`

GetEnabledOk returns a tuple with the Enabled field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEnabled

`func (o *DebugOptions) SetEnabled(v bool)`

SetEnabled sets Enabled field to given value.

### HasEnabled

`func (o *DebugOptions) HasEnabled() bool`

HasEnabled returns a boolean if a field has been set.

### GetReturnUpstreamRequest

`func (o *DebugOptions) GetReturnUpstreamRequest() bool`

GetReturnUpstreamRequest returns the ReturnUpstreamRequest field if non-nil, zero value otherwise.

### GetReturnUpstreamRequestOk

`func (o *DebugOptions) GetReturnUpstreamRequestOk() (*bool, bool)`

GetReturnUpstreamRequestOk returns a tuple with the ReturnUpstreamRequest field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReturnUpstreamRequest

`func (o *DebugOptions) SetReturnUpstreamRequest(v bool)`

SetReturnUpstreamRequest sets ReturnUpstreamRequest field to given value.

### HasReturnUpstreamRequest

`func (o *DebugOptions) HasReturnUpstreamRequest() bool`

HasReturnUpstreamRequest returns a boolean if a field has been set.

### GetReturnUpstreamResponse

`func (o *DebugOptions) GetReturnUpstreamResponse() bool`

GetReturnUpstreamResponse returns the ReturnUpstreamResponse field if non-nil, zero value otherwise.

### GetReturnUpstreamResponseOk

`func (o *DebugOptions) GetReturnUpstreamResponseOk() (*bool, bool)`

GetReturnUpstreamResponseOk returns a tuple with the ReturnUpstreamResponse field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReturnUpstreamResponse

`func (o *DebugOptions) SetReturnUpstreamResponse(v bool)`

SetReturnUpstreamResponse sets ReturnUpstreamResponse field to given value.

### HasReturnUpstreamResponse

`func (o *DebugOptions) HasReturnUpstreamResponse() bool`

HasReturnUpstreamResponse returns a boolean if a field has been set.

### GetTrace

`func (o *DebugOptions) GetTrace() bool`

GetTrace returns the Trace field if non-nil, zero value otherwise.

### GetTraceOk

`func (o *DebugOptions) GetTraceOk() (*bool, bool)`

GetTraceOk returns a tuple with the Trace field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTrace

`func (o *DebugOptions) SetTrace(v bool)`

SetTrace sets Trace field to given value.

### HasTrace

`func (o *DebugOptions) HasTrace() bool`

HasTrace returns a boolean if a field has been set.

### GetTraceLevel

`func (o *DebugOptions) GetTraceLevel() string`

GetTraceLevel returns the TraceLevel field if non-nil, zero value otherwise.

### GetTraceLevelOk

`func (o *DebugOptions) GetTraceLevelOk() (*string, bool)`

GetTraceLevelOk returns a tuple with the TraceLevel field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTraceLevel

`func (o *DebugOptions) SetTraceLevel(v string)`

SetTraceLevel sets TraceLevel field to given value.

### HasTraceLevel

`func (o *DebugOptions) HasTraceLevel() bool`

HasTraceLevel returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


