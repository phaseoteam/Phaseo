# ModerationResult

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Flagged** | Pointer to **bool** |  | [optional] 
**Categories** | Pointer to [**ModerationCategories**](ModerationCategories.md) |  | [optional] 
**CategoryScores** | Pointer to [**ModerationCategoryScores**](ModerationCategoryScores.md) |  | [optional] 

## Methods

### NewModerationResult

`func NewModerationResult() *ModerationResult`

NewModerationResult instantiates a new ModerationResult object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewModerationResultWithDefaults

`func NewModerationResultWithDefaults() *ModerationResult`

NewModerationResultWithDefaults instantiates a new ModerationResult object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetFlagged

`func (o *ModerationResult) GetFlagged() bool`

GetFlagged returns the Flagged field if non-nil, zero value otherwise.

### GetFlaggedOk

`func (o *ModerationResult) GetFlaggedOk() (*bool, bool)`

GetFlaggedOk returns a tuple with the Flagged field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFlagged

`func (o *ModerationResult) SetFlagged(v bool)`

SetFlagged sets Flagged field to given value.

### HasFlagged

`func (o *ModerationResult) HasFlagged() bool`

HasFlagged returns a boolean if a field has been set.

### GetCategories

`func (o *ModerationResult) GetCategories() ModerationCategories`

GetCategories returns the Categories field if non-nil, zero value otherwise.

### GetCategoriesOk

`func (o *ModerationResult) GetCategoriesOk() (*ModerationCategories, bool)`

GetCategoriesOk returns a tuple with the Categories field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCategories

`func (o *ModerationResult) SetCategories(v ModerationCategories)`

SetCategories sets Categories field to given value.

### HasCategories

`func (o *ModerationResult) HasCategories() bool`

HasCategories returns a boolean if a field has been set.

### GetCategoryScores

`func (o *ModerationResult) GetCategoryScores() ModerationCategoryScores`

GetCategoryScores returns the CategoryScores field if non-nil, zero value otherwise.

### GetCategoryScoresOk

`func (o *ModerationResult) GetCategoryScoresOk() (*ModerationCategoryScores, bool)`

GetCategoryScoresOk returns a tuple with the CategoryScores field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCategoryScores

`func (o *ModerationResult) SetCategoryScores(v ModerationCategoryScores)`

SetCategoryScores sets CategoryScores field to given value.

### HasCategoryScores

`func (o *ModerationResult) HasCategoryScores() bool`

HasCategoryScores returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


