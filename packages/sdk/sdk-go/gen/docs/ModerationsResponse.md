# ModerationsResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | Pointer to **string** |  | [optional] 
**Model** | Pointer to **string** |  | [optional] 
**Results** | Pointer to [**[]ModerationResult**](ModerationResult.md) |  | [optional] 

## Methods

### NewModerationsResponse

`func NewModerationsResponse() *ModerationsResponse`

NewModerationsResponse instantiates a new ModerationsResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewModerationsResponseWithDefaults

`func NewModerationsResponseWithDefaults() *ModerationsResponse`

NewModerationsResponseWithDefaults instantiates a new ModerationsResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *ModerationsResponse) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *ModerationsResponse) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *ModerationsResponse) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *ModerationsResponse) HasId() bool`

HasId returns a boolean if a field has been set.

### GetModel

`func (o *ModerationsResponse) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *ModerationsResponse) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *ModerationsResponse) SetModel(v string)`

SetModel sets Model field to given value.

### HasModel

`func (o *ModerationsResponse) HasModel() bool`

HasModel returns a boolean if a field has been set.

### GetResults

`func (o *ModerationsResponse) GetResults() []ModerationResult`

GetResults returns the Results field if non-nil, zero value otherwise.

### GetResultsOk

`func (o *ModerationsResponse) GetResultsOk() (*[]ModerationResult, bool)`

GetResultsOk returns a tuple with the Results field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetResults

`func (o *ModerationsResponse) SetResults(v []ModerationResult)`

SetResults sets Results field to given value.

### HasResults

`func (o *ModerationsResponse) HasResults() bool`

HasResults returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


