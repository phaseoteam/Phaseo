# ProviderRoutingOptions

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Order** | Pointer to **[]string** |  | [optional] 
**Only** | Pointer to **[]string** |  | [optional] 
**Ignore** | Pointer to **[]string** |  | [optional] 
**IncludeAlpha** | Pointer to **bool** | Include alpha providers in routing (off by default). | [optional] 

## Methods

### NewProviderRoutingOptions

`func NewProviderRoutingOptions() *ProviderRoutingOptions`

NewProviderRoutingOptions instantiates a new ProviderRoutingOptions object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewProviderRoutingOptionsWithDefaults

`func NewProviderRoutingOptionsWithDefaults() *ProviderRoutingOptions`

NewProviderRoutingOptionsWithDefaults instantiates a new ProviderRoutingOptions object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetOrder

`func (o *ProviderRoutingOptions) GetOrder() []string`

GetOrder returns the Order field if non-nil, zero value otherwise.

### GetOrderOk

`func (o *ProviderRoutingOptions) GetOrderOk() (*[]string, bool)`

GetOrderOk returns a tuple with the Order field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOrder

`func (o *ProviderRoutingOptions) SetOrder(v []string)`

SetOrder sets Order field to given value.

### HasOrder

`func (o *ProviderRoutingOptions) HasOrder() bool`

HasOrder returns a boolean if a field has been set.

### GetOnly

`func (o *ProviderRoutingOptions) GetOnly() []string`

GetOnly returns the Only field if non-nil, zero value otherwise.

### GetOnlyOk

`func (o *ProviderRoutingOptions) GetOnlyOk() (*[]string, bool)`

GetOnlyOk returns a tuple with the Only field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOnly

`func (o *ProviderRoutingOptions) SetOnly(v []string)`

SetOnly sets Only field to given value.

### HasOnly

`func (o *ProviderRoutingOptions) HasOnly() bool`

HasOnly returns a boolean if a field has been set.

### GetIgnore

`func (o *ProviderRoutingOptions) GetIgnore() []string`

GetIgnore returns the Ignore field if non-nil, zero value otherwise.

### GetIgnoreOk

`func (o *ProviderRoutingOptions) GetIgnoreOk() (*[]string, bool)`

GetIgnoreOk returns a tuple with the Ignore field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetIgnore

`func (o *ProviderRoutingOptions) SetIgnore(v []string)`

SetIgnore sets Ignore field to given value.

### HasIgnore

`func (o *ProviderRoutingOptions) HasIgnore() bool`

HasIgnore returns a boolean if a field has been set.

### GetIncludeAlpha

`func (o *ProviderRoutingOptions) GetIncludeAlpha() bool`

GetIncludeAlpha returns the IncludeAlpha field if non-nil, zero value otherwise.

### GetIncludeAlphaOk

`func (o *ProviderRoutingOptions) GetIncludeAlphaOk() (*bool, bool)`

GetIncludeAlphaOk returns a tuple with the IncludeAlpha field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetIncludeAlpha

`func (o *ProviderRoutingOptions) SetIncludeAlpha(v bool)`

SetIncludeAlpha sets IncludeAlpha field to given value.

### HasIncludeAlpha

`func (o *ProviderRoutingOptions) HasIncludeAlpha() bool`

HasIncludeAlpha returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


