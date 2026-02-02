# UpdateProvisioningKeyRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Name** | Pointer to **string** | New name for the key | [optional] 
**Status** | Pointer to **string** | New status for the key | [optional] 
**SoftBlocked** | Pointer to **bool** | Whether to temporarily block the key | [optional] 

## Methods

### NewUpdateProvisioningKeyRequest

`func NewUpdateProvisioningKeyRequest() *UpdateProvisioningKeyRequest`

NewUpdateProvisioningKeyRequest instantiates a new UpdateProvisioningKeyRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewUpdateProvisioningKeyRequestWithDefaults

`func NewUpdateProvisioningKeyRequestWithDefaults() *UpdateProvisioningKeyRequest`

NewUpdateProvisioningKeyRequestWithDefaults instantiates a new UpdateProvisioningKeyRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetName

`func (o *UpdateProvisioningKeyRequest) GetName() string`

GetName returns the Name field if non-nil, zero value otherwise.

### GetNameOk

`func (o *UpdateProvisioningKeyRequest) GetNameOk() (*string, bool)`

GetNameOk returns a tuple with the Name field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetName

`func (o *UpdateProvisioningKeyRequest) SetName(v string)`

SetName sets Name field to given value.

### HasName

`func (o *UpdateProvisioningKeyRequest) HasName() bool`

HasName returns a boolean if a field has been set.

### GetStatus

`func (o *UpdateProvisioningKeyRequest) GetStatus() string`

GetStatus returns the Status field if non-nil, zero value otherwise.

### GetStatusOk

`func (o *UpdateProvisioningKeyRequest) GetStatusOk() (*string, bool)`

GetStatusOk returns a tuple with the Status field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStatus

`func (o *UpdateProvisioningKeyRequest) SetStatus(v string)`

SetStatus sets Status field to given value.

### HasStatus

`func (o *UpdateProvisioningKeyRequest) HasStatus() bool`

HasStatus returns a boolean if a field has been set.

### GetSoftBlocked

`func (o *UpdateProvisioningKeyRequest) GetSoftBlocked() bool`

GetSoftBlocked returns the SoftBlocked field if non-nil, zero value otherwise.

### GetSoftBlockedOk

`func (o *UpdateProvisioningKeyRequest) GetSoftBlockedOk() (*bool, bool)`

GetSoftBlockedOk returns a tuple with the SoftBlocked field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSoftBlocked

`func (o *UpdateProvisioningKeyRequest) SetSoftBlocked(v bool)`

SetSoftBlocked sets SoftBlocked field to given value.

### HasSoftBlocked

`func (o *UpdateProvisioningKeyRequest) HasSoftBlocked() bool`

HasSoftBlocked returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


