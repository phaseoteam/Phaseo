# Model

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**ModelId** | Pointer to **string** |  | [optional] 
**Name** | Pointer to **NullableString** |  | [optional] 
**ReleaseDate** | Pointer to **NullableString** |  | [optional] 
**DeprecationDate** | Pointer to **NullableString** |  | [optional] 
**RetirementDate** | Pointer to **NullableString** |  | [optional] 
**Status** | Pointer to **NullableString** |  | [optional] 
**OrganisationId** | Pointer to **NullableString** |  | [optional] 
**OrganisationName** | Pointer to **NullableString** |  | [optional] 
**OrganisationColour** | Pointer to **NullableString** |  | [optional] 
**Aliases** | Pointer to **[]string** |  | [optional] 
**Endpoints** | Pointer to **[]string** |  | [optional] 
**InputTypes** | Pointer to **[]string** |  | [optional] 
**OutputTypes** | Pointer to **[]string** |  | [optional] 
**Providers** | Pointer to [**[]ModelProvidersInner**](ModelProvidersInner.md) |  | [optional] 
**SupportedParams** | Pointer to **[]string** |  | [optional] 
**TopProvider** | Pointer to **NullableString** |  | [optional] 
**Pricing** | Pointer to [**ModelPricing**](ModelPricing.md) |  | [optional] 

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

### SetNameNil

`func (o *Model) SetNameNil(b bool)`

 SetNameNil sets the value for Name to be an explicit nil

### UnsetName
`func (o *Model) UnsetName()`

UnsetName ensures that no value is present for Name, not even an explicit nil
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

### SetReleaseDateNil

`func (o *Model) SetReleaseDateNil(b bool)`

 SetReleaseDateNil sets the value for ReleaseDate to be an explicit nil

### UnsetReleaseDate
`func (o *Model) UnsetReleaseDate()`

UnsetReleaseDate ensures that no value is present for ReleaseDate, not even an explicit nil
### GetDeprecationDate

`func (o *Model) GetDeprecationDate() string`

GetDeprecationDate returns the DeprecationDate field if non-nil, zero value otherwise.

### GetDeprecationDateOk

`func (o *Model) GetDeprecationDateOk() (*string, bool)`

GetDeprecationDateOk returns a tuple with the DeprecationDate field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDeprecationDate

`func (o *Model) SetDeprecationDate(v string)`

SetDeprecationDate sets DeprecationDate field to given value.

### HasDeprecationDate

`func (o *Model) HasDeprecationDate() bool`

HasDeprecationDate returns a boolean if a field has been set.

### SetDeprecationDateNil

`func (o *Model) SetDeprecationDateNil(b bool)`

 SetDeprecationDateNil sets the value for DeprecationDate to be an explicit nil

### UnsetDeprecationDate
`func (o *Model) UnsetDeprecationDate()`

UnsetDeprecationDate ensures that no value is present for DeprecationDate, not even an explicit nil
### GetRetirementDate

`func (o *Model) GetRetirementDate() string`

GetRetirementDate returns the RetirementDate field if non-nil, zero value otherwise.

### GetRetirementDateOk

`func (o *Model) GetRetirementDateOk() (*string, bool)`

GetRetirementDateOk returns a tuple with the RetirementDate field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRetirementDate

`func (o *Model) SetRetirementDate(v string)`

SetRetirementDate sets RetirementDate field to given value.

### HasRetirementDate

`func (o *Model) HasRetirementDate() bool`

HasRetirementDate returns a boolean if a field has been set.

### SetRetirementDateNil

`func (o *Model) SetRetirementDateNil(b bool)`

 SetRetirementDateNil sets the value for RetirementDate to be an explicit nil

### UnsetRetirementDate
`func (o *Model) UnsetRetirementDate()`

UnsetRetirementDate ensures that no value is present for RetirementDate, not even an explicit nil
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

### SetStatusNil

`func (o *Model) SetStatusNil(b bool)`

 SetStatusNil sets the value for Status to be an explicit nil

### UnsetStatus
`func (o *Model) UnsetStatus()`

UnsetStatus ensures that no value is present for Status, not even an explicit nil
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

### SetOrganisationIdNil

`func (o *Model) SetOrganisationIdNil(b bool)`

 SetOrganisationIdNil sets the value for OrganisationId to be an explicit nil

### UnsetOrganisationId
`func (o *Model) UnsetOrganisationId()`

UnsetOrganisationId ensures that no value is present for OrganisationId, not even an explicit nil
### GetOrganisationName

`func (o *Model) GetOrganisationName() string`

GetOrganisationName returns the OrganisationName field if non-nil, zero value otherwise.

### GetOrganisationNameOk

`func (o *Model) GetOrganisationNameOk() (*string, bool)`

GetOrganisationNameOk returns a tuple with the OrganisationName field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOrganisationName

`func (o *Model) SetOrganisationName(v string)`

SetOrganisationName sets OrganisationName field to given value.

### HasOrganisationName

`func (o *Model) HasOrganisationName() bool`

HasOrganisationName returns a boolean if a field has been set.

### SetOrganisationNameNil

`func (o *Model) SetOrganisationNameNil(b bool)`

 SetOrganisationNameNil sets the value for OrganisationName to be an explicit nil

### UnsetOrganisationName
`func (o *Model) UnsetOrganisationName()`

UnsetOrganisationName ensures that no value is present for OrganisationName, not even an explicit nil
### GetOrganisationColour

`func (o *Model) GetOrganisationColour() string`

GetOrganisationColour returns the OrganisationColour field if non-nil, zero value otherwise.

### GetOrganisationColourOk

`func (o *Model) GetOrganisationColourOk() (*string, bool)`

GetOrganisationColourOk returns a tuple with the OrganisationColour field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOrganisationColour

`func (o *Model) SetOrganisationColour(v string)`

SetOrganisationColour sets OrganisationColour field to given value.

### HasOrganisationColour

`func (o *Model) HasOrganisationColour() bool`

HasOrganisationColour returns a boolean if a field has been set.

### SetOrganisationColourNil

`func (o *Model) SetOrganisationColourNil(b bool)`

 SetOrganisationColourNil sets the value for OrganisationColour to be an explicit nil

### UnsetOrganisationColour
`func (o *Model) UnsetOrganisationColour()`

UnsetOrganisationColour ensures that no value is present for OrganisationColour, not even an explicit nil
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

### GetSupportedParams

`func (o *Model) GetSupportedParams() []string`

GetSupportedParams returns the SupportedParams field if non-nil, zero value otherwise.

### GetSupportedParamsOk

`func (o *Model) GetSupportedParamsOk() (*[]string, bool)`

GetSupportedParamsOk returns a tuple with the SupportedParams field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSupportedParams

`func (o *Model) SetSupportedParams(v []string)`

SetSupportedParams sets SupportedParams field to given value.

### HasSupportedParams

`func (o *Model) HasSupportedParams() bool`

HasSupportedParams returns a boolean if a field has been set.

### GetTopProvider

`func (o *Model) GetTopProvider() string`

GetTopProvider returns the TopProvider field if non-nil, zero value otherwise.

### GetTopProviderOk

`func (o *Model) GetTopProviderOk() (*string, bool)`

GetTopProviderOk returns a tuple with the TopProvider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTopProvider

`func (o *Model) SetTopProvider(v string)`

SetTopProvider sets TopProvider field to given value.

### HasTopProvider

`func (o *Model) HasTopProvider() bool`

HasTopProvider returns a boolean if a field has been set.

### SetTopProviderNil

`func (o *Model) SetTopProviderNil(b bool)`

 SetTopProviderNil sets the value for TopProvider to be an explicit nil

### UnsetTopProvider
`func (o *Model) UnsetTopProvider()`

UnsetTopProvider ensures that no value is present for TopProvider, not even an explicit nil
### GetPricing

`func (o *Model) GetPricing() ModelPricing`

GetPricing returns the Pricing field if non-nil, zero value otherwise.

### GetPricingOk

`func (o *Model) GetPricingOk() (*ModelPricing, bool)`

GetPricingOk returns a tuple with the Pricing field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPricing

`func (o *Model) SetPricing(v ModelPricing)`

SetPricing sets Pricing field to given value.

### HasPricing

`func (o *Model) HasPricing() bool`

HasPricing returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


