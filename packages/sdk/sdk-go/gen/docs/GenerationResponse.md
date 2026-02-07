# GenerationResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**RequestId** | Pointer to **string** |  | [optional] 
**TeamId** | Pointer to **string** |  | [optional] 
**AppId** | Pointer to **NullableString** |  | [optional] 
**Endpoint** | Pointer to **string** |  | [optional] 
**ModelId** | Pointer to **string** |  | [optional] 
**Provider** | Pointer to **string** |  | [optional] 
**NativeResponseId** | Pointer to **NullableString** |  | [optional] 
**Stream** | Pointer to **bool** |  | [optional] 
**Byok** | Pointer to **bool** |  | [optional] 
**StatusCode** | Pointer to **float32** |  | [optional] 
**Success** | Pointer to **bool** |  | [optional] 
**ErrorCode** | Pointer to **NullableString** |  | [optional] 
**ErrorMessage** | Pointer to **NullableString** |  | [optional] 
**LatencyMs** | Pointer to **float32** |  | [optional] 
**GenerationMs** | Pointer to **float32** |  | [optional] 
**Usage** | Pointer to [**NullableGenerationResponseUsage**](GenerationResponseUsage.md) |  | [optional] 
**CostNanos** | Pointer to **float32** |  | [optional] 
**Currency** | Pointer to **string** |  | [optional] 
**PricingLines** | Pointer to **[]map[string]interface{}** |  | [optional] 
**KeyId** | Pointer to **string** |  | [optional] 
**Throughput** | Pointer to **NullableFloat32** |  | [optional] 

## Methods

### NewGenerationResponse

`func NewGenerationResponse() *GenerationResponse`

NewGenerationResponse instantiates a new GenerationResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewGenerationResponseWithDefaults

`func NewGenerationResponseWithDefaults() *GenerationResponse`

NewGenerationResponseWithDefaults instantiates a new GenerationResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetRequestId

`func (o *GenerationResponse) GetRequestId() string`

GetRequestId returns the RequestId field if non-nil, zero value otherwise.

### GetRequestIdOk

`func (o *GenerationResponse) GetRequestIdOk() (*string, bool)`

GetRequestIdOk returns a tuple with the RequestId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRequestId

`func (o *GenerationResponse) SetRequestId(v string)`

SetRequestId sets RequestId field to given value.

### HasRequestId

`func (o *GenerationResponse) HasRequestId() bool`

HasRequestId returns a boolean if a field has been set.

### GetTeamId

`func (o *GenerationResponse) GetTeamId() string`

GetTeamId returns the TeamId field if non-nil, zero value otherwise.

### GetTeamIdOk

`func (o *GenerationResponse) GetTeamIdOk() (*string, bool)`

GetTeamIdOk returns a tuple with the TeamId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTeamId

`func (o *GenerationResponse) SetTeamId(v string)`

SetTeamId sets TeamId field to given value.

### HasTeamId

`func (o *GenerationResponse) HasTeamId() bool`

HasTeamId returns a boolean if a field has been set.

### GetAppId

`func (o *GenerationResponse) GetAppId() string`

GetAppId returns the AppId field if non-nil, zero value otherwise.

### GetAppIdOk

`func (o *GenerationResponse) GetAppIdOk() (*string, bool)`

GetAppIdOk returns a tuple with the AppId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAppId

`func (o *GenerationResponse) SetAppId(v string)`

SetAppId sets AppId field to given value.

### HasAppId

`func (o *GenerationResponse) HasAppId() bool`

HasAppId returns a boolean if a field has been set.

### SetAppIdNil

`func (o *GenerationResponse) SetAppIdNil(b bool)`

 SetAppIdNil sets the value for AppId to be an explicit nil

### UnsetAppId
`func (o *GenerationResponse) UnsetAppId()`

UnsetAppId ensures that no value is present for AppId, not even an explicit nil
### GetEndpoint

`func (o *GenerationResponse) GetEndpoint() string`

GetEndpoint returns the Endpoint field if non-nil, zero value otherwise.

### GetEndpointOk

`func (o *GenerationResponse) GetEndpointOk() (*string, bool)`

GetEndpointOk returns a tuple with the Endpoint field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEndpoint

`func (o *GenerationResponse) SetEndpoint(v string)`

SetEndpoint sets Endpoint field to given value.

### HasEndpoint

`func (o *GenerationResponse) HasEndpoint() bool`

HasEndpoint returns a boolean if a field has been set.

### GetModelId

`func (o *GenerationResponse) GetModelId() string`

GetModelId returns the ModelId field if non-nil, zero value otherwise.

### GetModelIdOk

`func (o *GenerationResponse) GetModelIdOk() (*string, bool)`

GetModelIdOk returns a tuple with the ModelId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModelId

`func (o *GenerationResponse) SetModelId(v string)`

SetModelId sets ModelId field to given value.

### HasModelId

`func (o *GenerationResponse) HasModelId() bool`

HasModelId returns a boolean if a field has been set.

### GetProvider

`func (o *GenerationResponse) GetProvider() string`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *GenerationResponse) GetProviderOk() (*string, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *GenerationResponse) SetProvider(v string)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *GenerationResponse) HasProvider() bool`

HasProvider returns a boolean if a field has been set.

### GetNativeResponseId

`func (o *GenerationResponse) GetNativeResponseId() string`

GetNativeResponseId returns the NativeResponseId field if non-nil, zero value otherwise.

### GetNativeResponseIdOk

`func (o *GenerationResponse) GetNativeResponseIdOk() (*string, bool)`

GetNativeResponseIdOk returns a tuple with the NativeResponseId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetNativeResponseId

`func (o *GenerationResponse) SetNativeResponseId(v string)`

SetNativeResponseId sets NativeResponseId field to given value.

### HasNativeResponseId

`func (o *GenerationResponse) HasNativeResponseId() bool`

HasNativeResponseId returns a boolean if a field has been set.

### SetNativeResponseIdNil

`func (o *GenerationResponse) SetNativeResponseIdNil(b bool)`

 SetNativeResponseIdNil sets the value for NativeResponseId to be an explicit nil

### UnsetNativeResponseId
`func (o *GenerationResponse) UnsetNativeResponseId()`

UnsetNativeResponseId ensures that no value is present for NativeResponseId, not even an explicit nil
### GetStream

`func (o *GenerationResponse) GetStream() bool`

GetStream returns the Stream field if non-nil, zero value otherwise.

### GetStreamOk

`func (o *GenerationResponse) GetStreamOk() (*bool, bool)`

GetStreamOk returns a tuple with the Stream field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStream

`func (o *GenerationResponse) SetStream(v bool)`

SetStream sets Stream field to given value.

### HasStream

`func (o *GenerationResponse) HasStream() bool`

HasStream returns a boolean if a field has been set.

### GetByok

`func (o *GenerationResponse) GetByok() bool`

GetByok returns the Byok field if non-nil, zero value otherwise.

### GetByokOk

`func (o *GenerationResponse) GetByokOk() (*bool, bool)`

GetByokOk returns a tuple with the Byok field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetByok

`func (o *GenerationResponse) SetByok(v bool)`

SetByok sets Byok field to given value.

### HasByok

`func (o *GenerationResponse) HasByok() bool`

HasByok returns a boolean if a field has been set.

### GetStatusCode

`func (o *GenerationResponse) GetStatusCode() float32`

GetStatusCode returns the StatusCode field if non-nil, zero value otherwise.

### GetStatusCodeOk

`func (o *GenerationResponse) GetStatusCodeOk() (*float32, bool)`

GetStatusCodeOk returns a tuple with the StatusCode field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStatusCode

`func (o *GenerationResponse) SetStatusCode(v float32)`

SetStatusCode sets StatusCode field to given value.

### HasStatusCode

`func (o *GenerationResponse) HasStatusCode() bool`

HasStatusCode returns a boolean if a field has been set.

### GetSuccess

`func (o *GenerationResponse) GetSuccess() bool`

GetSuccess returns the Success field if non-nil, zero value otherwise.

### GetSuccessOk

`func (o *GenerationResponse) GetSuccessOk() (*bool, bool)`

GetSuccessOk returns a tuple with the Success field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSuccess

`func (o *GenerationResponse) SetSuccess(v bool)`

SetSuccess sets Success field to given value.

### HasSuccess

`func (o *GenerationResponse) HasSuccess() bool`

HasSuccess returns a boolean if a field has been set.

### GetErrorCode

`func (o *GenerationResponse) GetErrorCode() string`

GetErrorCode returns the ErrorCode field if non-nil, zero value otherwise.

### GetErrorCodeOk

`func (o *GenerationResponse) GetErrorCodeOk() (*string, bool)`

GetErrorCodeOk returns a tuple with the ErrorCode field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetErrorCode

`func (o *GenerationResponse) SetErrorCode(v string)`

SetErrorCode sets ErrorCode field to given value.

### HasErrorCode

`func (o *GenerationResponse) HasErrorCode() bool`

HasErrorCode returns a boolean if a field has been set.

### SetErrorCodeNil

`func (o *GenerationResponse) SetErrorCodeNil(b bool)`

 SetErrorCodeNil sets the value for ErrorCode to be an explicit nil

### UnsetErrorCode
`func (o *GenerationResponse) UnsetErrorCode()`

UnsetErrorCode ensures that no value is present for ErrorCode, not even an explicit nil
### GetErrorMessage

`func (o *GenerationResponse) GetErrorMessage() string`

GetErrorMessage returns the ErrorMessage field if non-nil, zero value otherwise.

### GetErrorMessageOk

`func (o *GenerationResponse) GetErrorMessageOk() (*string, bool)`

GetErrorMessageOk returns a tuple with the ErrorMessage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetErrorMessage

`func (o *GenerationResponse) SetErrorMessage(v string)`

SetErrorMessage sets ErrorMessage field to given value.

### HasErrorMessage

`func (o *GenerationResponse) HasErrorMessage() bool`

HasErrorMessage returns a boolean if a field has been set.

### SetErrorMessageNil

`func (o *GenerationResponse) SetErrorMessageNil(b bool)`

 SetErrorMessageNil sets the value for ErrorMessage to be an explicit nil

### UnsetErrorMessage
`func (o *GenerationResponse) UnsetErrorMessage()`

UnsetErrorMessage ensures that no value is present for ErrorMessage, not even an explicit nil
### GetLatencyMs

`func (o *GenerationResponse) GetLatencyMs() float32`

GetLatencyMs returns the LatencyMs field if non-nil, zero value otherwise.

### GetLatencyMsOk

`func (o *GenerationResponse) GetLatencyMsOk() (*float32, bool)`

GetLatencyMsOk returns a tuple with the LatencyMs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLatencyMs

`func (o *GenerationResponse) SetLatencyMs(v float32)`

SetLatencyMs sets LatencyMs field to given value.

### HasLatencyMs

`func (o *GenerationResponse) HasLatencyMs() bool`

HasLatencyMs returns a boolean if a field has been set.

### GetGenerationMs

`func (o *GenerationResponse) GetGenerationMs() float32`

GetGenerationMs returns the GenerationMs field if non-nil, zero value otherwise.

### GetGenerationMsOk

`func (o *GenerationResponse) GetGenerationMsOk() (*float32, bool)`

GetGenerationMsOk returns a tuple with the GenerationMs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetGenerationMs

`func (o *GenerationResponse) SetGenerationMs(v float32)`

SetGenerationMs sets GenerationMs field to given value.

### HasGenerationMs

`func (o *GenerationResponse) HasGenerationMs() bool`

HasGenerationMs returns a boolean if a field has been set.

### GetUsage

`func (o *GenerationResponse) GetUsage() GenerationResponseUsage`

GetUsage returns the Usage field if non-nil, zero value otherwise.

### GetUsageOk

`func (o *GenerationResponse) GetUsageOk() (*GenerationResponseUsage, bool)`

GetUsageOk returns a tuple with the Usage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUsage

`func (o *GenerationResponse) SetUsage(v GenerationResponseUsage)`

SetUsage sets Usage field to given value.

### HasUsage

`func (o *GenerationResponse) HasUsage() bool`

HasUsage returns a boolean if a field has been set.

### SetUsageNil

`func (o *GenerationResponse) SetUsageNil(b bool)`

 SetUsageNil sets the value for Usage to be an explicit nil

### UnsetUsage
`func (o *GenerationResponse) UnsetUsage()`

UnsetUsage ensures that no value is present for Usage, not even an explicit nil
### GetCostNanos

`func (o *GenerationResponse) GetCostNanos() float32`

GetCostNanos returns the CostNanos field if non-nil, zero value otherwise.

### GetCostNanosOk

`func (o *GenerationResponse) GetCostNanosOk() (*float32, bool)`

GetCostNanosOk returns a tuple with the CostNanos field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCostNanos

`func (o *GenerationResponse) SetCostNanos(v float32)`

SetCostNanos sets CostNanos field to given value.

### HasCostNanos

`func (o *GenerationResponse) HasCostNanos() bool`

HasCostNanos returns a boolean if a field has been set.

### GetCurrency

`func (o *GenerationResponse) GetCurrency() string`

GetCurrency returns the Currency field if non-nil, zero value otherwise.

### GetCurrencyOk

`func (o *GenerationResponse) GetCurrencyOk() (*string, bool)`

GetCurrencyOk returns a tuple with the Currency field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCurrency

`func (o *GenerationResponse) SetCurrency(v string)`

SetCurrency sets Currency field to given value.

### HasCurrency

`func (o *GenerationResponse) HasCurrency() bool`

HasCurrency returns a boolean if a field has been set.

### GetPricingLines

`func (o *GenerationResponse) GetPricingLines() []map[string]interface{}`

GetPricingLines returns the PricingLines field if non-nil, zero value otherwise.

### GetPricingLinesOk

`func (o *GenerationResponse) GetPricingLinesOk() (*[]map[string]interface{}, bool)`

GetPricingLinesOk returns a tuple with the PricingLines field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPricingLines

`func (o *GenerationResponse) SetPricingLines(v []map[string]interface{})`

SetPricingLines sets PricingLines field to given value.

### HasPricingLines

`func (o *GenerationResponse) HasPricingLines() bool`

HasPricingLines returns a boolean if a field has been set.

### GetKeyId

`func (o *GenerationResponse) GetKeyId() string`

GetKeyId returns the KeyId field if non-nil, zero value otherwise.

### GetKeyIdOk

`func (o *GenerationResponse) GetKeyIdOk() (*string, bool)`

GetKeyIdOk returns a tuple with the KeyId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetKeyId

`func (o *GenerationResponse) SetKeyId(v string)`

SetKeyId sets KeyId field to given value.

### HasKeyId

`func (o *GenerationResponse) HasKeyId() bool`

HasKeyId returns a boolean if a field has been set.

### GetThroughput

`func (o *GenerationResponse) GetThroughput() float32`

GetThroughput returns the Throughput field if non-nil, zero value otherwise.

### GetThroughputOk

`func (o *GenerationResponse) GetThroughputOk() (*float32, bool)`

GetThroughputOk returns a tuple with the Throughput field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetThroughput

`func (o *GenerationResponse) SetThroughput(v float32)`

SetThroughput sets Throughput field to given value.

### HasThroughput

`func (o *GenerationResponse) HasThroughput() bool`

HasThroughput returns a boolean if a field has been set.

### SetThroughputNil

`func (o *GenerationResponse) SetThroughputNil(b bool)`

 SetThroughputNil sets the value for Throughput to be an explicit nil

### UnsetThroughput
`func (o *GenerationResponse) UnsetThroughput()`

UnsetThroughput ensures that no value is present for Throughput, not even an explicit nil

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


