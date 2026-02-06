# ListProvisioningKeys200Response

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Ok** | Pointer to **bool** |  | [optional] 
**Limit** | Pointer to **int32** |  | [optional] 
**Offset** | Pointer to **int32** |  | [optional] 
**Total** | Pointer to **int32** |  | [optional] 
**Keys** | Pointer to [**[]ProvisioningKey**](ProvisioningKey.md) |  | [optional] 

## Methods

### NewListProvisioningKeys200Response

`func NewListProvisioningKeys200Response() *ListProvisioningKeys200Response`

NewListProvisioningKeys200Response instantiates a new ListProvisioningKeys200Response object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewListProvisioningKeys200ResponseWithDefaults

`func NewListProvisioningKeys200ResponseWithDefaults() *ListProvisioningKeys200Response`

NewListProvisioningKeys200ResponseWithDefaults instantiates a new ListProvisioningKeys200Response object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetOk

`func (o *ListProvisioningKeys200Response) GetOk() bool`

GetOk returns the Ok field if non-nil, zero value otherwise.

### GetOkOk

`func (o *ListProvisioningKeys200Response) GetOkOk() (*bool, bool)`

GetOkOk returns a tuple with the Ok field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOk

`func (o *ListProvisioningKeys200Response) SetOk(v bool)`

SetOk sets Ok field to given value.

### HasOk

`func (o *ListProvisioningKeys200Response) HasOk() bool`

HasOk returns a boolean if a field has been set.

### GetLimit

`func (o *ListProvisioningKeys200Response) GetLimit() int32`

GetLimit returns the Limit field if non-nil, zero value otherwise.

### GetLimitOk

`func (o *ListProvisioningKeys200Response) GetLimitOk() (*int32, bool)`

GetLimitOk returns a tuple with the Limit field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLimit

`func (o *ListProvisioningKeys200Response) SetLimit(v int32)`

SetLimit sets Limit field to given value.

### HasLimit

`func (o *ListProvisioningKeys200Response) HasLimit() bool`

HasLimit returns a boolean if a field has been set.

### GetOffset

`func (o *ListProvisioningKeys200Response) GetOffset() int32`

GetOffset returns the Offset field if non-nil, zero value otherwise.

### GetOffsetOk

`func (o *ListProvisioningKeys200Response) GetOffsetOk() (*int32, bool)`

GetOffsetOk returns a tuple with the Offset field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOffset

`func (o *ListProvisioningKeys200Response) SetOffset(v int32)`

SetOffset sets Offset field to given value.

### HasOffset

`func (o *ListProvisioningKeys200Response) HasOffset() bool`

HasOffset returns a boolean if a field has been set.

### GetTotal

`func (o *ListProvisioningKeys200Response) GetTotal() int32`

GetTotal returns the Total field if non-nil, zero value otherwise.

### GetTotalOk

`func (o *ListProvisioningKeys200Response) GetTotalOk() (*int32, bool)`

GetTotalOk returns a tuple with the Total field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTotal

`func (o *ListProvisioningKeys200Response) SetTotal(v int32)`

SetTotal sets Total field to given value.

### HasTotal

`func (o *ListProvisioningKeys200Response) HasTotal() bool`

HasTotal returns a boolean if a field has been set.

### GetKeys

`func (o *ListProvisioningKeys200Response) GetKeys() []ProvisioningKey`

GetKeys returns the Keys field if non-nil, zero value otherwise.

### GetKeysOk

`func (o *ListProvisioningKeys200Response) GetKeysOk() (*[]ProvisioningKey, bool)`

GetKeysOk returns a tuple with the Keys field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetKeys

`func (o *ListProvisioningKeys200Response) SetKeys(v []ProvisioningKey)`

SetKeys sets Keys field to given value.

### HasKeys

`func (o *ListProvisioningKeys200Response) HasKeys() bool`

HasKeys returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


