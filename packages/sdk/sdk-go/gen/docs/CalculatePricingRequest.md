# CalculatePricingRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Provider** | **string** |  | 
**Model** | **string** |  | 
**Endpoint** | **string** |  | 
**Usage** | **map[string]interface{}** |  | 

## Methods

### NewCalculatePricingRequest

`func NewCalculatePricingRequest(provider string, model string, endpoint string, usage map[string]interface{}, ) *CalculatePricingRequest`

NewCalculatePricingRequest instantiates a new CalculatePricingRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewCalculatePricingRequestWithDefaults

`func NewCalculatePricingRequestWithDefaults() *CalculatePricingRequest`

NewCalculatePricingRequestWithDefaults instantiates a new CalculatePricingRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetProvider

`func (o *CalculatePricingRequest) GetProvider() string`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *CalculatePricingRequest) GetProviderOk() (*string, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *CalculatePricingRequest) SetProvider(v string)`

SetProvider sets Provider field to given value.


### GetModel

`func (o *CalculatePricingRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *CalculatePricingRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *CalculatePricingRequest) SetModel(v string)`

SetModel sets Model field to given value.


### GetEndpoint

`func (o *CalculatePricingRequest) GetEndpoint() string`

GetEndpoint returns the Endpoint field if non-nil, zero value otherwise.

### GetEndpointOk

`func (o *CalculatePricingRequest) GetEndpointOk() (*string, bool)`

GetEndpointOk returns a tuple with the Endpoint field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEndpoint

`func (o *CalculatePricingRequest) SetEndpoint(v string)`

SetEndpoint sets Endpoint field to given value.


### GetUsage

`func (o *CalculatePricingRequest) GetUsage() map[string]interface{}`

GetUsage returns the Usage field if non-nil, zero value otherwise.

### GetUsageOk

`func (o *CalculatePricingRequest) GetUsageOk() (*map[string]interface{}, bool)`

GetUsageOk returns a tuple with the Usage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUsage

`func (o *CalculatePricingRequest) SetUsage(v map[string]interface{})`

SetUsage sets Usage field to given value.



[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


