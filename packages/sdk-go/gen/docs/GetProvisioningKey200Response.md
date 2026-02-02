# GetProvisioningKey200Response

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Ok** | Pointer to **bool** |  | [optional] 
**Key** | Pointer to [**ProvisioningKeyDetail**](ProvisioningKeyDetail.md) |  | [optional] 

## Methods

### NewGetProvisioningKey200Response

`func NewGetProvisioningKey200Response() *GetProvisioningKey200Response`

NewGetProvisioningKey200Response instantiates a new GetProvisioningKey200Response object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewGetProvisioningKey200ResponseWithDefaults

`func NewGetProvisioningKey200ResponseWithDefaults() *GetProvisioningKey200Response`

NewGetProvisioningKey200ResponseWithDefaults instantiates a new GetProvisioningKey200Response object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetOk

`func (o *GetProvisioningKey200Response) GetOk() bool`

GetOk returns the Ok field if non-nil, zero value otherwise.

### GetOkOk

`func (o *GetProvisioningKey200Response) GetOkOk() (*bool, bool)`

GetOkOk returns a tuple with the Ok field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOk

`func (o *GetProvisioningKey200Response) SetOk(v bool)`

SetOk sets Ok field to given value.

### HasOk

`func (o *GetProvisioningKey200Response) HasOk() bool`

HasOk returns a boolean if a field has been set.

### GetKey

`func (o *GetProvisioningKey200Response) GetKey() ProvisioningKeyDetail`

GetKey returns the Key field if non-nil, zero value otherwise.

### GetKeyOk

`func (o *GetProvisioningKey200Response) GetKeyOk() (*ProvisioningKeyDetail, bool)`

GetKeyOk returns a tuple with the Key field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetKey

`func (o *GetProvisioningKey200Response) SetKey(v ProvisioningKeyDetail)`

SetKey sets Key field to given value.

### HasKey

`func (o *GetProvisioningKey200Response) HasKey() bool`

HasKey returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


