# MusicGenerateRequestSuno

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Prompt** | Pointer to **string** |  | [optional] 
**Style** | Pointer to **string** |  | [optional] 
**Title** | Pointer to **string** |  | [optional] 
**CustomMode** | Pointer to **bool** |  | [optional] 
**Instrumental** | Pointer to **bool** |  | [optional] 
**PersonaId** | Pointer to **string** |  | [optional] 
**Model** | Pointer to **string** |  | [optional] 
**NegativeTags** | Pointer to **string** |  | [optional] 
**VocalGender** | Pointer to **string** |  | [optional] 
**StyleWeight** | Pointer to **float32** |  | [optional] 
**WeirdnessConstraint** | Pointer to **float32** |  | [optional] 
**AudioWeight** | Pointer to **float32** |  | [optional] 
**CallBackUrl** | Pointer to **string** |  | [optional] 

## Methods

### NewMusicGenerateRequestSuno

`func NewMusicGenerateRequestSuno() *MusicGenerateRequestSuno`

NewMusicGenerateRequestSuno instantiates a new MusicGenerateRequestSuno object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewMusicGenerateRequestSunoWithDefaults

`func NewMusicGenerateRequestSunoWithDefaults() *MusicGenerateRequestSuno`

NewMusicGenerateRequestSunoWithDefaults instantiates a new MusicGenerateRequestSuno object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetPrompt

`func (o *MusicGenerateRequestSuno) GetPrompt() string`

GetPrompt returns the Prompt field if non-nil, zero value otherwise.

### GetPromptOk

`func (o *MusicGenerateRequestSuno) GetPromptOk() (*string, bool)`

GetPromptOk returns a tuple with the Prompt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPrompt

`func (o *MusicGenerateRequestSuno) SetPrompt(v string)`

SetPrompt sets Prompt field to given value.

### HasPrompt

`func (o *MusicGenerateRequestSuno) HasPrompt() bool`

HasPrompt returns a boolean if a field has been set.

### GetStyle

`func (o *MusicGenerateRequestSuno) GetStyle() string`

GetStyle returns the Style field if non-nil, zero value otherwise.

### GetStyleOk

`func (o *MusicGenerateRequestSuno) GetStyleOk() (*string, bool)`

GetStyleOk returns a tuple with the Style field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStyle

`func (o *MusicGenerateRequestSuno) SetStyle(v string)`

SetStyle sets Style field to given value.

### HasStyle

`func (o *MusicGenerateRequestSuno) HasStyle() bool`

HasStyle returns a boolean if a field has been set.

### GetTitle

`func (o *MusicGenerateRequestSuno) GetTitle() string`

GetTitle returns the Title field if non-nil, zero value otherwise.

### GetTitleOk

`func (o *MusicGenerateRequestSuno) GetTitleOk() (*string, bool)`

GetTitleOk returns a tuple with the Title field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTitle

`func (o *MusicGenerateRequestSuno) SetTitle(v string)`

SetTitle sets Title field to given value.

### HasTitle

`func (o *MusicGenerateRequestSuno) HasTitle() bool`

HasTitle returns a boolean if a field has been set.

### GetCustomMode

`func (o *MusicGenerateRequestSuno) GetCustomMode() bool`

GetCustomMode returns the CustomMode field if non-nil, zero value otherwise.

### GetCustomModeOk

`func (o *MusicGenerateRequestSuno) GetCustomModeOk() (*bool, bool)`

GetCustomModeOk returns a tuple with the CustomMode field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCustomMode

`func (o *MusicGenerateRequestSuno) SetCustomMode(v bool)`

SetCustomMode sets CustomMode field to given value.

### HasCustomMode

`func (o *MusicGenerateRequestSuno) HasCustomMode() bool`

HasCustomMode returns a boolean if a field has been set.

### GetInstrumental

`func (o *MusicGenerateRequestSuno) GetInstrumental() bool`

GetInstrumental returns the Instrumental field if non-nil, zero value otherwise.

### GetInstrumentalOk

`func (o *MusicGenerateRequestSuno) GetInstrumentalOk() (*bool, bool)`

GetInstrumentalOk returns a tuple with the Instrumental field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInstrumental

`func (o *MusicGenerateRequestSuno) SetInstrumental(v bool)`

SetInstrumental sets Instrumental field to given value.

### HasInstrumental

`func (o *MusicGenerateRequestSuno) HasInstrumental() bool`

HasInstrumental returns a boolean if a field has been set.

### GetPersonaId

`func (o *MusicGenerateRequestSuno) GetPersonaId() string`

GetPersonaId returns the PersonaId field if non-nil, zero value otherwise.

### GetPersonaIdOk

`func (o *MusicGenerateRequestSuno) GetPersonaIdOk() (*string, bool)`

GetPersonaIdOk returns a tuple with the PersonaId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPersonaId

`func (o *MusicGenerateRequestSuno) SetPersonaId(v string)`

SetPersonaId sets PersonaId field to given value.

### HasPersonaId

`func (o *MusicGenerateRequestSuno) HasPersonaId() bool`

HasPersonaId returns a boolean if a field has been set.

### GetModel

`func (o *MusicGenerateRequestSuno) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *MusicGenerateRequestSuno) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *MusicGenerateRequestSuno) SetModel(v string)`

SetModel sets Model field to given value.

### HasModel

`func (o *MusicGenerateRequestSuno) HasModel() bool`

HasModel returns a boolean if a field has been set.

### GetNegativeTags

`func (o *MusicGenerateRequestSuno) GetNegativeTags() string`

GetNegativeTags returns the NegativeTags field if non-nil, zero value otherwise.

### GetNegativeTagsOk

`func (o *MusicGenerateRequestSuno) GetNegativeTagsOk() (*string, bool)`

GetNegativeTagsOk returns a tuple with the NegativeTags field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetNegativeTags

`func (o *MusicGenerateRequestSuno) SetNegativeTags(v string)`

SetNegativeTags sets NegativeTags field to given value.

### HasNegativeTags

`func (o *MusicGenerateRequestSuno) HasNegativeTags() bool`

HasNegativeTags returns a boolean if a field has been set.

### GetVocalGender

`func (o *MusicGenerateRequestSuno) GetVocalGender() string`

GetVocalGender returns the VocalGender field if non-nil, zero value otherwise.

### GetVocalGenderOk

`func (o *MusicGenerateRequestSuno) GetVocalGenderOk() (*string, bool)`

GetVocalGenderOk returns a tuple with the VocalGender field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetVocalGender

`func (o *MusicGenerateRequestSuno) SetVocalGender(v string)`

SetVocalGender sets VocalGender field to given value.

### HasVocalGender

`func (o *MusicGenerateRequestSuno) HasVocalGender() bool`

HasVocalGender returns a boolean if a field has been set.

### GetStyleWeight

`func (o *MusicGenerateRequestSuno) GetStyleWeight() float32`

GetStyleWeight returns the StyleWeight field if non-nil, zero value otherwise.

### GetStyleWeightOk

`func (o *MusicGenerateRequestSuno) GetStyleWeightOk() (*float32, bool)`

GetStyleWeightOk returns a tuple with the StyleWeight field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStyleWeight

`func (o *MusicGenerateRequestSuno) SetStyleWeight(v float32)`

SetStyleWeight sets StyleWeight field to given value.

### HasStyleWeight

`func (o *MusicGenerateRequestSuno) HasStyleWeight() bool`

HasStyleWeight returns a boolean if a field has been set.

### GetWeirdnessConstraint

`func (o *MusicGenerateRequestSuno) GetWeirdnessConstraint() float32`

GetWeirdnessConstraint returns the WeirdnessConstraint field if non-nil, zero value otherwise.

### GetWeirdnessConstraintOk

`func (o *MusicGenerateRequestSuno) GetWeirdnessConstraintOk() (*float32, bool)`

GetWeirdnessConstraintOk returns a tuple with the WeirdnessConstraint field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetWeirdnessConstraint

`func (o *MusicGenerateRequestSuno) SetWeirdnessConstraint(v float32)`

SetWeirdnessConstraint sets WeirdnessConstraint field to given value.

### HasWeirdnessConstraint

`func (o *MusicGenerateRequestSuno) HasWeirdnessConstraint() bool`

HasWeirdnessConstraint returns a boolean if a field has been set.

### GetAudioWeight

`func (o *MusicGenerateRequestSuno) GetAudioWeight() float32`

GetAudioWeight returns the AudioWeight field if non-nil, zero value otherwise.

### GetAudioWeightOk

`func (o *MusicGenerateRequestSuno) GetAudioWeightOk() (*float32, bool)`

GetAudioWeightOk returns a tuple with the AudioWeight field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAudioWeight

`func (o *MusicGenerateRequestSuno) SetAudioWeight(v float32)`

SetAudioWeight sets AudioWeight field to given value.

### HasAudioWeight

`func (o *MusicGenerateRequestSuno) HasAudioWeight() bool`

HasAudioWeight returns a boolean if a field has been set.

### GetCallBackUrl

`func (o *MusicGenerateRequestSuno) GetCallBackUrl() string`

GetCallBackUrl returns the CallBackUrl field if non-nil, zero value otherwise.

### GetCallBackUrlOk

`func (o *MusicGenerateRequestSuno) GetCallBackUrlOk() (*string, bool)`

GetCallBackUrlOk returns a tuple with the CallBackUrl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCallBackUrl

`func (o *MusicGenerateRequestSuno) SetCallBackUrl(v string)`

SetCallBackUrl sets CallBackUrl field to given value.

### HasCallBackUrl

`func (o *MusicGenerateRequestSuno) HasCallBackUrl() bool`

HasCallBackUrl returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


