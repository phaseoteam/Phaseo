# ListOrganisations200Response

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Ok** | Pointer to **bool** |  | [optional] 
**Limit** | Pointer to **int32** |  | [optional] 
**Offset** | Pointer to **int32** |  | [optional] 
**Total** | Pointer to **int32** |  | [optional] 
**Organisations** | Pointer to [**[]ListOrganisations200ResponseOrganisationsInner**](ListOrganisations200ResponseOrganisationsInner.md) |  | [optional] 

## Methods

### NewListOrganisations200Response

`func NewListOrganisations200Response() *ListOrganisations200Response`

NewListOrganisations200Response instantiates a new ListOrganisations200Response object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewListOrganisations200ResponseWithDefaults

`func NewListOrganisations200ResponseWithDefaults() *ListOrganisations200Response`

NewListOrganisations200ResponseWithDefaults instantiates a new ListOrganisations200Response object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetOk

`func (o *ListOrganisations200Response) GetOk() bool`

GetOk returns the Ok field if non-nil, zero value otherwise.

### GetOkOk

`func (o *ListOrganisations200Response) GetOkOk() (*bool, bool)`

GetOkOk returns a tuple with the Ok field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOk

`func (o *ListOrganisations200Response) SetOk(v bool)`

SetOk sets Ok field to given value.

### HasOk

`func (o *ListOrganisations200Response) HasOk() bool`

HasOk returns a boolean if a field has been set.

### GetLimit

`func (o *ListOrganisations200Response) GetLimit() int32`

GetLimit returns the Limit field if non-nil, zero value otherwise.

### GetLimitOk

`func (o *ListOrganisations200Response) GetLimitOk() (*int32, bool)`

GetLimitOk returns a tuple with the Limit field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLimit

`func (o *ListOrganisations200Response) SetLimit(v int32)`

SetLimit sets Limit field to given value.

### HasLimit

`func (o *ListOrganisations200Response) HasLimit() bool`

HasLimit returns a boolean if a field has been set.

### GetOffset

`func (o *ListOrganisations200Response) GetOffset() int32`

GetOffset returns the Offset field if non-nil, zero value otherwise.

### GetOffsetOk

`func (o *ListOrganisations200Response) GetOffsetOk() (*int32, bool)`

GetOffsetOk returns a tuple with the Offset field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOffset

`func (o *ListOrganisations200Response) SetOffset(v int32)`

SetOffset sets Offset field to given value.

### HasOffset

`func (o *ListOrganisations200Response) HasOffset() bool`

HasOffset returns a boolean if a field has been set.

### GetTotal

`func (o *ListOrganisations200Response) GetTotal() int32`

GetTotal returns the Total field if non-nil, zero value otherwise.

### GetTotalOk

`func (o *ListOrganisations200Response) GetTotalOk() (*int32, bool)`

GetTotalOk returns a tuple with the Total field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTotal

`func (o *ListOrganisations200Response) SetTotal(v int32)`

SetTotal sets Total field to given value.

### HasTotal

`func (o *ListOrganisations200Response) HasTotal() bool`

HasTotal returns a boolean if a field has been set.

### GetOrganisations

`func (o *ListOrganisations200Response) GetOrganisations() []ListOrganisations200ResponseOrganisationsInner`

GetOrganisations returns the Organisations field if non-nil, zero value otherwise.

### GetOrganisationsOk

`func (o *ListOrganisations200Response) GetOrganisationsOk() (*[]ListOrganisations200ResponseOrganisationsInner, bool)`

GetOrganisationsOk returns a tuple with the Organisations field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOrganisations

`func (o *ListOrganisations200Response) SetOrganisations(v []ListOrganisations200ResponseOrganisationsInner)`

SetOrganisations sets Organisations field to given value.

### HasOrganisations

`func (o *ListOrganisations200Response) HasOrganisations() bool`

HasOrganisations returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


