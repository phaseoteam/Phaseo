# ModelPricing

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**PricingPlan** | Pointer to **string** |  | [optional] 
**Meters** | Pointer to [**ModelPricingMeters**](ModelPricingMeters.md) |  | [optional] 

## Methods

### NewModelPricing

`func NewModelPricing() *ModelPricing`

NewModelPricing instantiates a new ModelPricing object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewModelPricingWithDefaults

`func NewModelPricingWithDefaults() *ModelPricing`

NewModelPricingWithDefaults instantiates a new ModelPricing object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetPricingPlan

`func (o *ModelPricing) GetPricingPlan() string`

GetPricingPlan returns the PricingPlan field if non-nil, zero value otherwise.

### GetPricingPlanOk

`func (o *ModelPricing) GetPricingPlanOk() (*string, bool)`

GetPricingPlanOk returns a tuple with the PricingPlan field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPricingPlan

`func (o *ModelPricing) SetPricingPlan(v string)`

SetPricingPlan sets PricingPlan field to given value.

### HasPricingPlan

`func (o *ModelPricing) HasPricingPlan() bool`

HasPricingPlan returns a boolean if a field has been set.

### GetMeters

`func (o *ModelPricing) GetMeters() ModelPricingMeters`

GetMeters returns the Meters field if non-nil, zero value otherwise.

### GetMetersOk

`func (o *ModelPricing) GetMetersOk() (*ModelPricingMeters, bool)`

GetMetersOk returns a tuple with the Meters field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMeters

`func (o *ModelPricing) SetMeters(v ModelPricingMeters)`

SetMeters sets Meters field to given value.

### HasMeters

`func (o *ModelPricing) HasMeters() bool`

HasMeters returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


