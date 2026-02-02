# CreateProvisioningKeyRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**TeamId** | **string** | The team ID this key belongs to | 
**Name** | **string** | A descriptive name for the key | 
**Scopes** | Pointer to **string** | Comma-separated list of scopes | [optional] [default to "read,write"]
**CreatedBy** | **string** | The user ID creating this key | 

## Methods

### NewCreateProvisioningKeyRequest

`func NewCreateProvisioningKeyRequest(teamId string, name string, createdBy string, ) *CreateProvisioningKeyRequest`

NewCreateProvisioningKeyRequest instantiates a new CreateProvisioningKeyRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewCreateProvisioningKeyRequestWithDefaults

`func NewCreateProvisioningKeyRequestWithDefaults() *CreateProvisioningKeyRequest`

NewCreateProvisioningKeyRequestWithDefaults instantiates a new CreateProvisioningKeyRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetTeamId

`func (o *CreateProvisioningKeyRequest) GetTeamId() string`

GetTeamId returns the TeamId field if non-nil, zero value otherwise.

### GetTeamIdOk

`func (o *CreateProvisioningKeyRequest) GetTeamIdOk() (*string, bool)`

GetTeamIdOk returns a tuple with the TeamId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTeamId

`func (o *CreateProvisioningKeyRequest) SetTeamId(v string)`

SetTeamId sets TeamId field to given value.


### GetName

`func (o *CreateProvisioningKeyRequest) GetName() string`

GetName returns the Name field if non-nil, zero value otherwise.

### GetNameOk

`func (o *CreateProvisioningKeyRequest) GetNameOk() (*string, bool)`

GetNameOk returns a tuple with the Name field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetName

`func (o *CreateProvisioningKeyRequest) SetName(v string)`

SetName sets Name field to given value.


### GetScopes

`func (o *CreateProvisioningKeyRequest) GetScopes() string`

GetScopes returns the Scopes field if non-nil, zero value otherwise.

### GetScopesOk

`func (o *CreateProvisioningKeyRequest) GetScopesOk() (*string, bool)`

GetScopesOk returns a tuple with the Scopes field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetScopes

`func (o *CreateProvisioningKeyRequest) SetScopes(v string)`

SetScopes sets Scopes field to given value.

### HasScopes

`func (o *CreateProvisioningKeyRequest) HasScopes() bool`

HasScopes returns a boolean if a field has been set.

### GetCreatedBy

`func (o *CreateProvisioningKeyRequest) GetCreatedBy() string`

GetCreatedBy returns the CreatedBy field if non-nil, zero value otherwise.

### GetCreatedByOk

`func (o *CreateProvisioningKeyRequest) GetCreatedByOk() (*string, bool)`

GetCreatedByOk returns a tuple with the CreatedBy field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCreatedBy

`func (o *CreateProvisioningKeyRequest) SetCreatedBy(v string)`

SetCreatedBy sets CreatedBy field to given value.



[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


