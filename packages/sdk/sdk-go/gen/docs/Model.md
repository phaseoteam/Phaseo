# Model

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**ModelId** | Pointer to **string** |  | [optional] 
**Name** | Pointer to **string** |  | [optional] 
**ReleaseDate** | Pointer to **string** |  | [optional] 
**Status** | Pointer to **string** |  | [optional] 
**OrganisationId** | Pointer to **string** |  | [optional] 
**Aliases** | Pointer to **[]string** |  | [optional] 
**Endpoints** | Pointer to **[]string** |  | [optional] 
**InputTypes** | Pointer to **[]string** |  | [optional] 
**OutputTypes** | Pointer to **[]string** |  | [optional] 
**Providers** | Pointer to [**[]ModelProvidersInner**](ModelProvidersInner.md) |  | [optional] 

## Methods

### NewModel

`func NewModel() *Model`

NewModel instantiates a new Model object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewModelWithDefaults

`func NewModelWithDefaults() *Model`

NewModelWithDefaults instantiates a new Model object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetModelId

`func (o *Model) GetModelId() string`

GetModelId returns the ModelId field if non-nil, zero value otherwise.

### GetModelIdOk

`func (o *Model) GetModelIdOk() (*string, bool)`

GetModelIdOk returns a tuple with the ModelId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModelId

`func (o *Model) SetModelId(v string)`

SetModelId sets ModelId field to given value.

### HasModelId

`func (o *Model) HasModelId() bool`

HasModelId returns a boolean if a field has been set.

### GetName

`func (o *Model) GetName() string`

GetName returns the Name field if non-nil, zero value otherwise.

### GetNameOk

`func (o *Model) GetNameOk() (*string, bool)`

GetNameOk returns a tuple with the Name field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetName

`func (o *Model) SetName(v string)`

SetName sets Name field to given value.

### HasName

`func (o *Model) HasName() bool`

HasName returns a boolean if a field has been set.

### GetReleaseDate

`func (o *Model) GetReleaseDate() string`

GetReleaseDate returns the ReleaseDate field if non-nil, zero value otherwise.

### GetReleaseDateOk

`func (o *Model) GetReleaseDateOk() (*string, bool)`

GetReleaseDateOk returns a tuple with the ReleaseDate field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReleaseDate

`func (o *Model) SetReleaseDate(v string)`

SetReleaseDate sets ReleaseDate field to given value.

### HasReleaseDate

`func (o *Model) HasReleaseDate() bool`

HasReleaseDate returns a boolean if a field has been set.

### GetStatus

`func (o *Model) GetStatus() string`

GetStatus returns the Status field if non-nil, zero value otherwise.

### GetStatusOk

`func (o *Model) GetStatusOk() (*string, bool)`

GetStatusOk returns a tuple with the Status field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStatus

`func (o *Model) SetStatus(v string)`

SetStatus sets Status field to given value.

### HasStatus

`func (o *Model) HasStatus() bool`

HasStatus returns a boolean if a field has been set.

### GetOrganisationId

`func (o *Model) GetOrganisationId() string`

GetOrganisationId returns the OrganisationId field if non-nil, zero value otherwise.

### GetOrganisationIdOk

`func (o *Model) GetOrganisationIdOk() (*string, bool)`

GetOrganisationIdOk returns a tuple with the OrganisationId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOrganisationId

`func (o *Model) SetOrganisationId(v string)`

SetOrganisationId sets OrganisationId field to given value.

### HasOrganisationId

`func (o *Model) HasOrganisationId() bool`

HasOrganisationId returns a boolean if a field has been set.

### GetAliases

`func (o *Model) GetAliases() []string`

GetAliases returns the Aliases field if non-nil, zero value otherwise.

### GetAliasesOk

`func (o *Model) GetAliasesOk() (*[]string, bool)`

GetAliasesOk returns a tuple with the Aliases field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAliases

`func (o *Model) SetAliases(v []string)`

SetAliases sets Aliases field to given value.

### HasAliases

`func (o *Model) HasAliases() bool`

HasAliases returns a boolean if a field has been set.

### GetEndpoints

`func (o *Model) GetEndpoints() []string`

GetEndpoints returns the Endpoints field if non-nil, zero value otherwise.

### GetEndpointsOk

`func (o *Model) GetEndpointsOk() (*[]string, bool)`

GetEndpointsOk returns a tuple with the Endpoints field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEndpoints

`func (o *Model) SetEndpoints(v []string)`

SetEndpoints sets Endpoints field to given value.

### HasEndpoints

`func (o *Model) HasEndpoints() bool`

HasEndpoints returns a boolean if a field has been set.

### GetInputTypes

`func (o *Model) GetInputTypes() []string`

GetInputTypes returns the InputTypes field if non-nil, zero value otherwise.

### GetInputTypesOk

`func (o *Model) GetInputTypesOk() (*[]string, bool)`

GetInputTypesOk returns a tuple with the InputTypes field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputTypes

`func (o *Model) SetInputTypes(v []string)`

SetInputTypes sets InputTypes field to given value.

### HasInputTypes

`func (o *Model) HasInputTypes() bool`

HasInputTypes returns a boolean if a field has been set.

### GetOutputTypes

`func (o *Model) GetOutputTypes() []string`

GetOutputTypes returns the OutputTypes field if non-nil, zero value otherwise.

### GetOutputTypesOk

`func (o *Model) GetOutputTypesOk() (*[]string, bool)`

GetOutputTypesOk returns a tuple with the OutputTypes field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOutputTypes

`func (o *Model) SetOutputTypes(v []string)`

SetOutputTypes sets OutputTypes field to given value.

### HasOutputTypes

`func (o *Model) HasOutputTypes() bool`

HasOutputTypes returns a boolean if a field has been set.

### GetProviders

`func (o *Model) GetProviders() []ModelProvidersInner`

GetProviders returns the Providers field if non-nil, zero value otherwise.

### GetProvidersOk

`func (o *Model) GetProvidersOk() (*[]ModelProvidersInner, bool)`

GetProvidersOk returns a tuple with the Providers field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProviders

`func (o *Model) SetProviders(v []ModelProvidersInner)`

SetProviders sets Providers field to given value.

### HasProviders

`func (o *Model) HasProviders() bool`

HasProviders returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


