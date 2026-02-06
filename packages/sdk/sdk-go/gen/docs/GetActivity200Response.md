# GetActivity200Response

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Ok** | Pointer to **bool** |  | [optional] 
**PeriodDays** | Pointer to **int32** |  | [optional] 
**Limit** | Pointer to **int32** |  | [optional] 
**Offset** | Pointer to **int32** |  | [optional] 
**Total** | Pointer to **int32** |  | [optional] 
**TotalCostCents** | Pointer to **float32** |  | [optional] 
**Activity** | Pointer to [**[]ActivityEntry**](ActivityEntry.md) |  | [optional] 

## Methods

### NewGetActivity200Response

`func NewGetActivity200Response() *GetActivity200Response`

NewGetActivity200Response instantiates a new GetActivity200Response object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewGetActivity200ResponseWithDefaults

`func NewGetActivity200ResponseWithDefaults() *GetActivity200Response`

NewGetActivity200ResponseWithDefaults instantiates a new GetActivity200Response object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetOk

`func (o *GetActivity200Response) GetOk() bool`

GetOk returns the Ok field if non-nil, zero value otherwise.

### GetOkOk

`func (o *GetActivity200Response) GetOkOk() (*bool, bool)`

GetOkOk returns a tuple with the Ok field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOk

`func (o *GetActivity200Response) SetOk(v bool)`

SetOk sets Ok field to given value.

### HasOk

`func (o *GetActivity200Response) HasOk() bool`

HasOk returns a boolean if a field has been set.

### GetPeriodDays

`func (o *GetActivity200Response) GetPeriodDays() int32`

GetPeriodDays returns the PeriodDays field if non-nil, zero value otherwise.

### GetPeriodDaysOk

`func (o *GetActivity200Response) GetPeriodDaysOk() (*int32, bool)`

GetPeriodDaysOk returns a tuple with the PeriodDays field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPeriodDays

`func (o *GetActivity200Response) SetPeriodDays(v int32)`

SetPeriodDays sets PeriodDays field to given value.

### HasPeriodDays

`func (o *GetActivity200Response) HasPeriodDays() bool`

HasPeriodDays returns a boolean if a field has been set.

### GetLimit

`func (o *GetActivity200Response) GetLimit() int32`

GetLimit returns the Limit field if non-nil, zero value otherwise.

### GetLimitOk

`func (o *GetActivity200Response) GetLimitOk() (*int32, bool)`

GetLimitOk returns a tuple with the Limit field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLimit

`func (o *GetActivity200Response) SetLimit(v int32)`

SetLimit sets Limit field to given value.

### HasLimit

`func (o *GetActivity200Response) HasLimit() bool`

HasLimit returns a boolean if a field has been set.

### GetOffset

`func (o *GetActivity200Response) GetOffset() int32`

GetOffset returns the Offset field if non-nil, zero value otherwise.

### GetOffsetOk

`func (o *GetActivity200Response) GetOffsetOk() (*int32, bool)`

GetOffsetOk returns a tuple with the Offset field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOffset

`func (o *GetActivity200Response) SetOffset(v int32)`

SetOffset sets Offset field to given value.

### HasOffset

`func (o *GetActivity200Response) HasOffset() bool`

HasOffset returns a boolean if a field has been set.

### GetTotal

`func (o *GetActivity200Response) GetTotal() int32`

GetTotal returns the Total field if non-nil, zero value otherwise.

### GetTotalOk

`func (o *GetActivity200Response) GetTotalOk() (*int32, bool)`

GetTotalOk returns a tuple with the Total field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTotal

`func (o *GetActivity200Response) SetTotal(v int32)`

SetTotal sets Total field to given value.

### HasTotal

`func (o *GetActivity200Response) HasTotal() bool`

HasTotal returns a boolean if a field has been set.

### GetTotalCostCents

`func (o *GetActivity200Response) GetTotalCostCents() float32`

GetTotalCostCents returns the TotalCostCents field if non-nil, zero value otherwise.

### GetTotalCostCentsOk

`func (o *GetActivity200Response) GetTotalCostCentsOk() (*float32, bool)`

GetTotalCostCentsOk returns a tuple with the TotalCostCents field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTotalCostCents

`func (o *GetActivity200Response) SetTotalCostCents(v float32)`

SetTotalCostCents sets TotalCostCents field to given value.

### HasTotalCostCents

`func (o *GetActivity200Response) HasTotalCostCents() bool`

HasTotalCostCents returns a boolean if a field has been set.

### GetActivity

`func (o *GetActivity200Response) GetActivity() []ActivityEntry`

GetActivity returns the Activity field if non-nil, zero value otherwise.

### GetActivityOk

`func (o *GetActivity200Response) GetActivityOk() (*[]ActivityEntry, bool)`

GetActivityOk returns a tuple with the Activity field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetActivity

`func (o *GetActivity200Response) SetActivity(v []ActivityEntry)`

SetActivity sets Activity field to given value.

### HasActivity

`func (o *GetActivity200Response) HasActivity() bool`

HasActivity returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


