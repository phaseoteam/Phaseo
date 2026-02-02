# ListProviders200Response

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Ok** | Pointer to **bool** |  | [optional] 
**Limit** | Pointer to **int32** |  | [optional] 
**Offset** | Pointer to **int32** |  | [optional] 
**Total** | Pointer to **int32** |  | [optional] 
**Providers** | Pointer to [**[]Provider**](Provider.md) |  | [optional] 

## Methods

### NewListProviders200Response

`func NewListProviders200Response() *ListProviders200Response`

NewListProviders200Response instantiates a new ListProviders200Response object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewListProviders200ResponseWithDefaults

`func NewListProviders200ResponseWithDefaults() *ListProviders200Response`

NewListProviders200ResponseWithDefaults instantiates a new ListProviders200Response object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetOk

`func (o *ListProviders200Response) GetOk() bool`

GetOk returns the Ok field if non-nil, zero value otherwise.

### GetOkOk

`func (o *ListProviders200Response) GetOkOk() (*bool, bool)`

GetOkOk returns a tuple with the Ok field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOk

`func (o *ListProviders200Response) SetOk(v bool)`

SetOk sets Ok field to given value.

### HasOk

`func (o *ListProviders200Response) HasOk() bool`

HasOk returns a boolean if a field has been set.

### GetLimit

`func (o *ListProviders200Response) GetLimit() int32`

GetLimit returns the Limit field if non-nil, zero value otherwise.

### GetLimitOk

`func (o *ListProviders200Response) GetLimitOk() (*int32, bool)`

GetLimitOk returns a tuple with the Limit field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLimit

`func (o *ListProviders200Response) SetLimit(v int32)`

SetLimit sets Limit field to given value.

### HasLimit

`func (o *ListProviders200Response) HasLimit() bool`

HasLimit returns a boolean if a field has been set.

### GetOffset

`func (o *ListProviders200Response) GetOffset() int32`

GetOffset returns the Offset field if non-nil, zero value otherwise.

### GetOffsetOk

`func (o *ListProviders200Response) GetOffsetOk() (*int32, bool)`

GetOffsetOk returns a tuple with the Offset field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOffset

`func (o *ListProviders200Response) SetOffset(v int32)`

SetOffset sets Offset field to given value.

### HasOffset

`func (o *ListProviders200Response) HasOffset() bool`

HasOffset returns a boolean if a field has been set.

### GetTotal

`func (o *ListProviders200Response) GetTotal() int32`

GetTotal returns the Total field if non-nil, zero value otherwise.

### GetTotalOk

`func (o *ListProviders200Response) GetTotalOk() (*int32, bool)`

GetTotalOk returns a tuple with the Total field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTotal

`func (o *ListProviders200Response) SetTotal(v int32)`

SetTotal sets Total field to given value.

### HasTotal

`func (o *ListProviders200Response) HasTotal() bool`

HasTotal returns a boolean if a field has been set.

### GetProviders

`func (o *ListProviders200Response) GetProviders() []Provider`

GetProviders returns the Providers field if non-nil, zero value otherwise.

### GetProvidersOk

`func (o *ListProviders200Response) GetProvidersOk() (*[]Provider, bool)`

GetProvidersOk returns a tuple with the Providers field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProviders

`func (o *ListProviders200Response) SetProviders(v []Provider)`

SetProviders sets Providers field to given value.

### HasProviders

`func (o *ListProviders200Response) HasProviders() bool`

HasProviders returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


