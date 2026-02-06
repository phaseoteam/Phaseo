# ProvisioningKeyDetail

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | Pointer to **string** |  | [optional] 
**TeamId** | Pointer to **string** |  | [optional] 
**Name** | Pointer to **string** |  | [optional] 
**Prefix** | Pointer to **string** |  | [optional] 
**Status** | Pointer to **string** |  | [optional] 
**Scopes** | Pointer to **string** |  | [optional] 
**CreatedBy** | Pointer to **string** |  | [optional] 
**CreatedAt** | Pointer to **time.Time** |  | [optional] 
**LastUsedAt** | Pointer to **NullableTime** |  | [optional] 
**SoftBlocked** | Pointer to **bool** |  | [optional] 

## Methods

### NewProvisioningKeyDetail

`func NewProvisioningKeyDetail() *ProvisioningKeyDetail`

NewProvisioningKeyDetail instantiates a new ProvisioningKeyDetail object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewProvisioningKeyDetailWithDefaults

`func NewProvisioningKeyDetailWithDefaults() *ProvisioningKeyDetail`

NewProvisioningKeyDetailWithDefaults instantiates a new ProvisioningKeyDetail object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *ProvisioningKeyDetail) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *ProvisioningKeyDetail) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *ProvisioningKeyDetail) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *ProvisioningKeyDetail) HasId() bool`

HasId returns a boolean if a field has been set.

### GetTeamId

`func (o *ProvisioningKeyDetail) GetTeamId() string`

GetTeamId returns the TeamId field if non-nil, zero value otherwise.

### GetTeamIdOk

`func (o *ProvisioningKeyDetail) GetTeamIdOk() (*string, bool)`

GetTeamIdOk returns a tuple with the TeamId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTeamId

`func (o *ProvisioningKeyDetail) SetTeamId(v string)`

SetTeamId sets TeamId field to given value.

### HasTeamId

`func (o *ProvisioningKeyDetail) HasTeamId() bool`

HasTeamId returns a boolean if a field has been set.

### GetName

`func (o *ProvisioningKeyDetail) GetName() string`

GetName returns the Name field if non-nil, zero value otherwise.

### GetNameOk

`func (o *ProvisioningKeyDetail) GetNameOk() (*string, bool)`

GetNameOk returns a tuple with the Name field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetName

`func (o *ProvisioningKeyDetail) SetName(v string)`

SetName sets Name field to given value.

### HasName

`func (o *ProvisioningKeyDetail) HasName() bool`

HasName returns a boolean if a field has been set.

### GetPrefix

`func (o *ProvisioningKeyDetail) GetPrefix() string`

GetPrefix returns the Prefix field if non-nil, zero value otherwise.

### GetPrefixOk

`func (o *ProvisioningKeyDetail) GetPrefixOk() (*string, bool)`

GetPrefixOk returns a tuple with the Prefix field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPrefix

`func (o *ProvisioningKeyDetail) SetPrefix(v string)`

SetPrefix sets Prefix field to given value.

### HasPrefix

`func (o *ProvisioningKeyDetail) HasPrefix() bool`

HasPrefix returns a boolean if a field has been set.

### GetStatus

`func (o *ProvisioningKeyDetail) GetStatus() string`

GetStatus returns the Status field if non-nil, zero value otherwise.

### GetStatusOk

`func (o *ProvisioningKeyDetail) GetStatusOk() (*string, bool)`

GetStatusOk returns a tuple with the Status field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStatus

`func (o *ProvisioningKeyDetail) SetStatus(v string)`

SetStatus sets Status field to given value.

### HasStatus

`func (o *ProvisioningKeyDetail) HasStatus() bool`

HasStatus returns a boolean if a field has been set.

### GetScopes

`func (o *ProvisioningKeyDetail) GetScopes() string`

GetScopes returns the Scopes field if non-nil, zero value otherwise.

### GetScopesOk

`func (o *ProvisioningKeyDetail) GetScopesOk() (*string, bool)`

GetScopesOk returns a tuple with the Scopes field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetScopes

`func (o *ProvisioningKeyDetail) SetScopes(v string)`

SetScopes sets Scopes field to given value.

### HasScopes

`func (o *ProvisioningKeyDetail) HasScopes() bool`

HasScopes returns a boolean if a field has been set.

### GetCreatedBy

`func (o *ProvisioningKeyDetail) GetCreatedBy() string`

GetCreatedBy returns the CreatedBy field if non-nil, zero value otherwise.

### GetCreatedByOk

`func (o *ProvisioningKeyDetail) GetCreatedByOk() (*string, bool)`

GetCreatedByOk returns a tuple with the CreatedBy field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCreatedBy

`func (o *ProvisioningKeyDetail) SetCreatedBy(v string)`

SetCreatedBy sets CreatedBy field to given value.

### HasCreatedBy

`func (o *ProvisioningKeyDetail) HasCreatedBy() bool`

HasCreatedBy returns a boolean if a field has been set.

### GetCreatedAt

`func (o *ProvisioningKeyDetail) GetCreatedAt() time.Time`

GetCreatedAt returns the CreatedAt field if non-nil, zero value otherwise.

### GetCreatedAtOk

`func (o *ProvisioningKeyDetail) GetCreatedAtOk() (*time.Time, bool)`

GetCreatedAtOk returns a tuple with the CreatedAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCreatedAt

`func (o *ProvisioningKeyDetail) SetCreatedAt(v time.Time)`

SetCreatedAt sets CreatedAt field to given value.

### HasCreatedAt

`func (o *ProvisioningKeyDetail) HasCreatedAt() bool`

HasCreatedAt returns a boolean if a field has been set.

### GetLastUsedAt

`func (o *ProvisioningKeyDetail) GetLastUsedAt() time.Time`

GetLastUsedAt returns the LastUsedAt field if non-nil, zero value otherwise.

### GetLastUsedAtOk

`func (o *ProvisioningKeyDetail) GetLastUsedAtOk() (*time.Time, bool)`

GetLastUsedAtOk returns a tuple with the LastUsedAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLastUsedAt

`func (o *ProvisioningKeyDetail) SetLastUsedAt(v time.Time)`

SetLastUsedAt sets LastUsedAt field to given value.

### HasLastUsedAt

`func (o *ProvisioningKeyDetail) HasLastUsedAt() bool`

HasLastUsedAt returns a boolean if a field has been set.

### SetLastUsedAtNil

`func (o *ProvisioningKeyDetail) SetLastUsedAtNil(b bool)`

 SetLastUsedAtNil sets the value for LastUsedAt to be an explicit nil

### UnsetLastUsedAt
`func (o *ProvisioningKeyDetail) UnsetLastUsedAt()`

UnsetLastUsedAt ensures that no value is present for LastUsedAt, not even an explicit nil
### GetSoftBlocked

`func (o *ProvisioningKeyDetail) GetSoftBlocked() bool`

GetSoftBlocked returns the SoftBlocked field if non-nil, zero value otherwise.

### GetSoftBlockedOk

`func (o *ProvisioningKeyDetail) GetSoftBlockedOk() (*bool, bool)`

GetSoftBlockedOk returns a tuple with the SoftBlocked field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSoftBlocked

`func (o *ProvisioningKeyDetail) SetSoftBlocked(v bool)`

SetSoftBlocked sets SoftBlocked field to given value.

### HasSoftBlocked

`func (o *ProvisioningKeyDetail) HasSoftBlocked() bool`

HasSoftBlocked returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


