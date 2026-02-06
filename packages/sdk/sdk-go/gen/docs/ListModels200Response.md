# ListModels200Response

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Ok** | Pointer to **bool** |  | [optional] 
**Limit** | Pointer to **int32** |  | [optional] 
**Offset** | Pointer to **int32** |  | [optional] 
**Total** | Pointer to **int32** |  | [optional] 
**Models** | Pointer to [**[]Model**](Model.md) |  | [optional] 

## Methods

### NewListModels200Response

`func NewListModels200Response() *ListModels200Response`

NewListModels200Response instantiates a new ListModels200Response object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewListModels200ResponseWithDefaults

`func NewListModels200ResponseWithDefaults() *ListModels200Response`

NewListModels200ResponseWithDefaults instantiates a new ListModels200Response object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetOk

`func (o *ListModels200Response) GetOk() bool`

GetOk returns the Ok field if non-nil, zero value otherwise.

### GetOkOk

`func (o *ListModels200Response) GetOkOk() (*bool, bool)`

GetOkOk returns a tuple with the Ok field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOk

`func (o *ListModels200Response) SetOk(v bool)`

SetOk sets Ok field to given value.

### HasOk

`func (o *ListModels200Response) HasOk() bool`

HasOk returns a boolean if a field has been set.

### GetLimit

`func (o *ListModels200Response) GetLimit() int32`

GetLimit returns the Limit field if non-nil, zero value otherwise.

### GetLimitOk

`func (o *ListModels200Response) GetLimitOk() (*int32, bool)`

GetLimitOk returns a tuple with the Limit field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLimit

`func (o *ListModels200Response) SetLimit(v int32)`

SetLimit sets Limit field to given value.

### HasLimit

`func (o *ListModels200Response) HasLimit() bool`

HasLimit returns a boolean if a field has been set.

### GetOffset

`func (o *ListModels200Response) GetOffset() int32`

GetOffset returns the Offset field if non-nil, zero value otherwise.

### GetOffsetOk

`func (o *ListModels200Response) GetOffsetOk() (*int32, bool)`

GetOffsetOk returns a tuple with the Offset field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOffset

`func (o *ListModels200Response) SetOffset(v int32)`

SetOffset sets Offset field to given value.

### HasOffset

`func (o *ListModels200Response) HasOffset() bool`

HasOffset returns a boolean if a field has been set.

### GetTotal

`func (o *ListModels200Response) GetTotal() int32`

GetTotal returns the Total field if non-nil, zero value otherwise.

### GetTotalOk

`func (o *ListModels200Response) GetTotalOk() (*int32, bool)`

GetTotalOk returns a tuple with the Total field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTotal

`func (o *ListModels200Response) SetTotal(v int32)`

SetTotal sets Total field to given value.

### HasTotal

`func (o *ListModels200Response) HasTotal() bool`

HasTotal returns a boolean if a field has been set.

### GetModels

`func (o *ListModels200Response) GetModels() []Model`

GetModels returns the Models field if non-nil, zero value otherwise.

### GetModelsOk

`func (o *ListModels200Response) GetModelsOk() (*[]Model, bool)`

GetModelsOk returns a tuple with the Models field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModels

`func (o *ListModels200Response) SetModels(v []Model)`

SetModels sets Models field to given value.

### HasModels

`func (o *ListModels200Response) HasModels() bool`

HasModels returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


