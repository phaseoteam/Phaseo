# CreateOAuthClientRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Name** | **string** |  | 
**Description** | Pointer to **string** |  | [optional] 
**HomepageUrl** | Pointer to **string** |  | [optional] 
**RedirectUris** | **[]string** |  | 
**LogoUrl** | Pointer to **string** |  | [optional] 
**PrivacyPolicyUrl** | Pointer to **string** |  | [optional] 
**TermsOfServiceUrl** | Pointer to **string** |  | [optional] 

## Methods

### NewCreateOAuthClientRequest

`func NewCreateOAuthClientRequest(name string, redirectUris []string, ) *CreateOAuthClientRequest`

NewCreateOAuthClientRequest instantiates a new CreateOAuthClientRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewCreateOAuthClientRequestWithDefaults

`func NewCreateOAuthClientRequestWithDefaults() *CreateOAuthClientRequest`

NewCreateOAuthClientRequestWithDefaults instantiates a new CreateOAuthClientRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetName

`func (o *CreateOAuthClientRequest) GetName() string`

GetName returns the Name field if non-nil, zero value otherwise.

### GetNameOk

`func (o *CreateOAuthClientRequest) GetNameOk() (*string, bool)`

GetNameOk returns a tuple with the Name field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetName

`func (o *CreateOAuthClientRequest) SetName(v string)`

SetName sets Name field to given value.


### GetDescription

`func (o *CreateOAuthClientRequest) GetDescription() string`

GetDescription returns the Description field if non-nil, zero value otherwise.

### GetDescriptionOk

`func (o *CreateOAuthClientRequest) GetDescriptionOk() (*string, bool)`

GetDescriptionOk returns a tuple with the Description field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDescription

`func (o *CreateOAuthClientRequest) SetDescription(v string)`

SetDescription sets Description field to given value.

### HasDescription

`func (o *CreateOAuthClientRequest) HasDescription() bool`

HasDescription returns a boolean if a field has been set.

### GetHomepageUrl

`func (o *CreateOAuthClientRequest) GetHomepageUrl() string`

GetHomepageUrl returns the HomepageUrl field if non-nil, zero value otherwise.

### GetHomepageUrlOk

`func (o *CreateOAuthClientRequest) GetHomepageUrlOk() (*string, bool)`

GetHomepageUrlOk returns a tuple with the HomepageUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetHomepageUrl

`func (o *CreateOAuthClientRequest) SetHomepageUrl(v string)`

SetHomepageUrl sets HomepageUrl field to given value.

### HasHomepageUrl

`func (o *CreateOAuthClientRequest) HasHomepageUrl() bool`

HasHomepageUrl returns a boolean if a field has been set.

### GetRedirectUris

`func (o *CreateOAuthClientRequest) GetRedirectUris() []string`

GetRedirectUris returns the RedirectUris field if non-nil, zero value otherwise.

### GetRedirectUrisOk

`func (o *CreateOAuthClientRequest) GetRedirectUrisOk() (*[]string, bool)`

GetRedirectUrisOk returns a tuple with the RedirectUris field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRedirectUris

`func (o *CreateOAuthClientRequest) SetRedirectUris(v []string)`

SetRedirectUris sets RedirectUris field to given value.


### GetLogoUrl

`func (o *CreateOAuthClientRequest) GetLogoUrl() string`

GetLogoUrl returns the LogoUrl field if non-nil, zero value otherwise.

### GetLogoUrlOk

`func (o *CreateOAuthClientRequest) GetLogoUrlOk() (*string, bool)`

GetLogoUrlOk returns a tuple with the LogoUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetLogoUrl

`func (o *CreateOAuthClientRequest) SetLogoUrl(v string)`

SetLogoUrl sets LogoUrl field to given value.

### HasLogoUrl

`func (o *CreateOAuthClientRequest) HasLogoUrl() bool`

HasLogoUrl returns a boolean if a field has been set.

### GetPrivacyPolicyUrl

`func (o *CreateOAuthClientRequest) GetPrivacyPolicyUrl() string`

GetPrivacyPolicyUrl returns the PrivacyPolicyUrl field if non-nil, zero value otherwise.

### GetPrivacyPolicyUrlOk

`func (o *CreateOAuthClientRequest) GetPrivacyPolicyUrlOk() (*string, bool)`

GetPrivacyPolicyUrlOk returns a tuple with the PrivacyPolicyUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPrivacyPolicyUrl

`func (o *CreateOAuthClientRequest) SetPrivacyPolicyUrl(v string)`

SetPrivacyPolicyUrl sets PrivacyPolicyUrl field to given value.

### HasPrivacyPolicyUrl

`func (o *CreateOAuthClientRequest) HasPrivacyPolicyUrl() bool`

HasPrivacyPolicyUrl returns a boolean if a field has been set.

### GetTermsOfServiceUrl

`func (o *CreateOAuthClientRequest) GetTermsOfServiceUrl() string`

GetTermsOfServiceUrl returns the TermsOfServiceUrl field if non-nil, zero value otherwise.

### GetTermsOfServiceUrlOk

`func (o *CreateOAuthClientRequest) GetTermsOfServiceUrlOk() (*string, bool)`

GetTermsOfServiceUrlOk returns a tuple with the TermsOfServiceUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTermsOfServiceUrl

`func (o *CreateOAuthClientRequest) SetTermsOfServiceUrl(v string)`

SetTermsOfServiceUrl sets TermsOfServiceUrl field to given value.

### HasTermsOfServiceUrl

`func (o *CreateOAuthClientRequest) HasTermsOfServiceUrl() bool`

HasTermsOfServiceUrl returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


