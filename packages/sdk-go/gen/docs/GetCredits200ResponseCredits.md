# GetCredits200ResponseCredits

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Remaining** | Pointer to **int32** | Current credit balance in nanos | [optional] 
**ThirtyDayUsage** | Pointer to **int32** | Credits consumed in the last 30 days (nanos) | [optional] 
**ThirtyDayRequests** | Pointer to **int32** | Number of API requests in the last 30 days | [optional] 

## Methods

### NewGetCredits200ResponseCredits

`func NewGetCredits200ResponseCredits() *GetCredits200ResponseCredits`

NewGetCredits200ResponseCredits instantiates a new GetCredits200ResponseCredits object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewGetCredits200ResponseCreditsWithDefaults

`func NewGetCredits200ResponseCreditsWithDefaults() *GetCredits200ResponseCredits`

NewGetCredits200ResponseCreditsWithDefaults instantiates a new GetCredits200ResponseCredits object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetRemaining

`func (o *GetCredits200ResponseCredits) GetRemaining() int32`

GetRemaining returns the Remaining field if non-nil, zero value otherwise.

### GetRemainingOk

`func (o *GetCredits200ResponseCredits) GetRemainingOk() (*int32, bool)`

GetRemainingOk returns a tuple with the Remaining field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRemaining

`func (o *GetCredits200ResponseCredits) SetRemaining(v int32)`

SetRemaining sets Remaining field to given value.

### HasRemaining

`func (o *GetCredits200ResponseCredits) HasRemaining() bool`

HasRemaining returns a boolean if a field has been set.

### GetThirtyDayUsage

`func (o *GetCredits200ResponseCredits) GetThirtyDayUsage() int32`

GetThirtyDayUsage returns the ThirtyDayUsage field if non-nil, zero value otherwise.

### GetThirtyDayUsageOk

`func (o *GetCredits200ResponseCredits) GetThirtyDayUsageOk() (*int32, bool)`

GetThirtyDayUsageOk returns a tuple with the ThirtyDayUsage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetThirtyDayUsage

`func (o *GetCredits200ResponseCredits) SetThirtyDayUsage(v int32)`

SetThirtyDayUsage sets ThirtyDayUsage field to given value.

### HasThirtyDayUsage

`func (o *GetCredits200ResponseCredits) HasThirtyDayUsage() bool`

HasThirtyDayUsage returns a boolean if a field has been set.

### GetThirtyDayRequests

`func (o *GetCredits200ResponseCredits) GetThirtyDayRequests() int32`

GetThirtyDayRequests returns the ThirtyDayRequests field if non-nil, zero value otherwise.

### GetThirtyDayRequestsOk

`func (o *GetCredits200ResponseCredits) GetThirtyDayRequestsOk() (*int32, bool)`

GetThirtyDayRequestsOk returns a tuple with the ThirtyDayRequests field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetThirtyDayRequests

`func (o *GetCredits200ResponseCredits) SetThirtyDayRequests(v int32)`

SetThirtyDayRequests sets ThirtyDayRequests field to given value.

### HasThirtyDayRequests

`func (o *GetCredits200ResponseCredits) HasThirtyDayRequests() bool`

HasThirtyDayRequests returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


