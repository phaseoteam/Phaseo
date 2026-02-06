# ModerationCategoryScores

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Hate** | Pointer to **float32** |  | [optional] 
**HateThreatening** | Pointer to **float32** |  | [optional] 
**Harassment** | Pointer to **float32** |  | [optional] 
**HarassmentThreatening** | Pointer to **float32** |  | [optional] 
**SelfHarm** | Pointer to **float32** |  | [optional] 
**SelfHarmIntent** | Pointer to **float32** |  | [optional] 
**SelfHarmInstructions** | Pointer to **float32** |  | [optional] 
**Sexual** | Pointer to **float32** |  | [optional] 
**SexualMinors** | Pointer to **float32** |  | [optional] 
**Violence** | Pointer to **float32** |  | [optional] 
**ViolenceGraphic** | Pointer to **float32** |  | [optional] 

## Methods

### NewModerationCategoryScores

`func NewModerationCategoryScores() *ModerationCategoryScores`

NewModerationCategoryScores instantiates a new ModerationCategoryScores object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewModerationCategoryScoresWithDefaults

`func NewModerationCategoryScoresWithDefaults() *ModerationCategoryScores`

NewModerationCategoryScoresWithDefaults instantiates a new ModerationCategoryScores object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetHate

`func (o *ModerationCategoryScores) GetHate() float32`

GetHate returns the Hate field if non-nil, zero value otherwise.

### GetHateOk

`func (o *ModerationCategoryScores) GetHateOk() (*float32, bool)`

GetHateOk returns a tuple with the Hate field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetHate

`func (o *ModerationCategoryScores) SetHate(v float32)`

SetHate sets Hate field to given value.

### HasHate

`func (o *ModerationCategoryScores) HasHate() bool`

HasHate returns a boolean if a field has been set.

### GetHateThreatening

`func (o *ModerationCategoryScores) GetHateThreatening() float32`

GetHateThreatening returns the HateThreatening field if non-nil, zero value otherwise.

### GetHateThreateningOk

`func (o *ModerationCategoryScores) GetHateThreateningOk() (*float32, bool)`

GetHateThreateningOk returns a tuple with the HateThreatening field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetHateThreatening

`func (o *ModerationCategoryScores) SetHateThreatening(v float32)`

SetHateThreatening sets HateThreatening field to given value.

### HasHateThreatening

`func (o *ModerationCategoryScores) HasHateThreatening() bool`

HasHateThreatening returns a boolean if a field has been set.

### GetHarassment

`func (o *ModerationCategoryScores) GetHarassment() float32`

GetHarassment returns the Harassment field if non-nil, zero value otherwise.

### GetHarassmentOk

`func (o *ModerationCategoryScores) GetHarassmentOk() (*float32, bool)`

GetHarassmentOk returns a tuple with the Harassment field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetHarassment

`func (o *ModerationCategoryScores) SetHarassment(v float32)`

SetHarassment sets Harassment field to given value.

### HasHarassment

`func (o *ModerationCategoryScores) HasHarassment() bool`

HasHarassment returns a boolean if a field has been set.

### GetHarassmentThreatening

`func (o *ModerationCategoryScores) GetHarassmentThreatening() float32`

GetHarassmentThreatening returns the HarassmentThreatening field if non-nil, zero value otherwise.

### GetHarassmentThreateningOk

`func (o *ModerationCategoryScores) GetHarassmentThreateningOk() (*float32, bool)`

GetHarassmentThreateningOk returns a tuple with the HarassmentThreatening field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetHarassmentThreatening

`func (o *ModerationCategoryScores) SetHarassmentThreatening(v float32)`

SetHarassmentThreatening sets HarassmentThreatening field to given value.

### HasHarassmentThreatening

`func (o *ModerationCategoryScores) HasHarassmentThreatening() bool`

HasHarassmentThreatening returns a boolean if a field has been set.

### GetSelfHarm

`func (o *ModerationCategoryScores) GetSelfHarm() float32`

GetSelfHarm returns the SelfHarm field if non-nil, zero value otherwise.

### GetSelfHarmOk

`func (o *ModerationCategoryScores) GetSelfHarmOk() (*float32, bool)`

GetSelfHarmOk returns a tuple with the SelfHarm field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSelfHarm

`func (o *ModerationCategoryScores) SetSelfHarm(v float32)`

SetSelfHarm sets SelfHarm field to given value.

### HasSelfHarm

`func (o *ModerationCategoryScores) HasSelfHarm() bool`

HasSelfHarm returns a boolean if a field has been set.

### GetSelfHarmIntent

`func (o *ModerationCategoryScores) GetSelfHarmIntent() float32`

GetSelfHarmIntent returns the SelfHarmIntent field if non-nil, zero value otherwise.

### GetSelfHarmIntentOk

`func (o *ModerationCategoryScores) GetSelfHarmIntentOk() (*float32, bool)`

GetSelfHarmIntentOk returns a tuple with the SelfHarmIntent field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSelfHarmIntent

`func (o *ModerationCategoryScores) SetSelfHarmIntent(v float32)`

SetSelfHarmIntent sets SelfHarmIntent field to given value.

### HasSelfHarmIntent

`func (o *ModerationCategoryScores) HasSelfHarmIntent() bool`

HasSelfHarmIntent returns a boolean if a field has been set.

### GetSelfHarmInstructions

`func (o *ModerationCategoryScores) GetSelfHarmInstructions() float32`

GetSelfHarmInstructions returns the SelfHarmInstructions field if non-nil, zero value otherwise.

### GetSelfHarmInstructionsOk

`func (o *ModerationCategoryScores) GetSelfHarmInstructionsOk() (*float32, bool)`

GetSelfHarmInstructionsOk returns a tuple with the SelfHarmInstructions field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSelfHarmInstructions

`func (o *ModerationCategoryScores) SetSelfHarmInstructions(v float32)`

SetSelfHarmInstructions sets SelfHarmInstructions field to given value.

### HasSelfHarmInstructions

`func (o *ModerationCategoryScores) HasSelfHarmInstructions() bool`

HasSelfHarmInstructions returns a boolean if a field has been set.

### GetSexual

`func (o *ModerationCategoryScores) GetSexual() float32`

GetSexual returns the Sexual field if non-nil, zero value otherwise.

### GetSexualOk

`func (o *ModerationCategoryScores) GetSexualOk() (*float32, bool)`

GetSexualOk returns a tuple with the Sexual field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSexual

`func (o *ModerationCategoryScores) SetSexual(v float32)`

SetSexual sets Sexual field to given value.

### HasSexual

`func (o *ModerationCategoryScores) HasSexual() bool`

HasSexual returns a boolean if a field has been set.

### GetSexualMinors

`func (o *ModerationCategoryScores) GetSexualMinors() float32`

GetSexualMinors returns the SexualMinors field if non-nil, zero value otherwise.

### GetSexualMinorsOk

`func (o *ModerationCategoryScores) GetSexualMinorsOk() (*float32, bool)`

GetSexualMinorsOk returns a tuple with the SexualMinors field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSexualMinors

`func (o *ModerationCategoryScores) SetSexualMinors(v float32)`

SetSexualMinors sets SexualMinors field to given value.

### HasSexualMinors

`func (o *ModerationCategoryScores) HasSexualMinors() bool`

HasSexualMinors returns a boolean if a field has been set.

### GetViolence

`func (o *ModerationCategoryScores) GetViolence() float32`

GetViolence returns the Violence field if non-nil, zero value otherwise.

### GetViolenceOk

`func (o *ModerationCategoryScores) GetViolenceOk() (*float32, bool)`

GetViolenceOk returns a tuple with the Violence field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetViolence

`func (o *ModerationCategoryScores) SetViolence(v float32)`

SetViolence sets Violence field to given value.

### HasViolence

`func (o *ModerationCategoryScores) HasViolence() bool`

HasViolence returns a boolean if a field has been set.

### GetViolenceGraphic

`func (o *ModerationCategoryScores) GetViolenceGraphic() float32`

GetViolenceGraphic returns the ViolenceGraphic field if non-nil, zero value otherwise.

### GetViolenceGraphicOk

`func (o *ModerationCategoryScores) GetViolenceGraphicOk() (*float32, bool)`

GetViolenceGraphicOk returns a tuple with the ViolenceGraphic field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetViolenceGraphic

`func (o *ModerationCategoryScores) SetViolenceGraphic(v float32)`

SetViolenceGraphic sets ViolenceGraphic field to given value.

### HasViolenceGraphic

`func (o *ModerationCategoryScores) HasViolenceGraphic() bool`

HasViolenceGraphic returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


