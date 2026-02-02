# MusicGenerateRequestElevenlabs

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Prompt** | Pointer to **string** |  | [optional] 
**CompositionPlan** | Pointer to **map[string]interface{}** |  | [optional] 
**MusicLengthMs** | Pointer to **int32** |  | [optional] 
**ModelId** | Pointer to **string** |  | [optional] 
**ForceInstrumental** | Pointer to **bool** |  | [optional] 
**StoreForInpainting** | Pointer to **bool** |  | [optional] 
**WithTimestamps** | Pointer to **bool** |  | [optional] 
**SignWithC2pa** | Pointer to **bool** |  | [optional] 
**OutputFormat** | Pointer to **string** |  | [optional] 

## Methods

### NewMusicGenerateRequestElevenlabs

`func NewMusicGenerateRequestElevenlabs() *MusicGenerateRequestElevenlabs`

NewMusicGenerateRequestElevenlabs instantiates a new MusicGenerateRequestElevenlabs object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewMusicGenerateRequestElevenlabsWithDefaults

`func NewMusicGenerateRequestElevenlabsWithDefaults() *MusicGenerateRequestElevenlabs`

NewMusicGenerateRequestElevenlabsWithDefaults instantiates a new MusicGenerateRequestElevenlabs object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetPrompt

`func (o *MusicGenerateRequestElevenlabs) GetPrompt() string`

GetPrompt returns the Prompt field if non-nil, zero value otherwise.

### GetPromptOk

`func (o *MusicGenerateRequestElevenlabs) GetPromptOk() (*string, bool)`

GetPromptOk returns a tuple with the Prompt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPrompt

`func (o *MusicGenerateRequestElevenlabs) SetPrompt(v string)`

SetPrompt sets Prompt field to given value.

### HasPrompt

`func (o *MusicGenerateRequestElevenlabs) HasPrompt() bool`

HasPrompt returns a boolean if a field has been set.

### GetCompositionPlan

`func (o *MusicGenerateRequestElevenlabs) GetCompositionPlan() map[string]interface{}`

GetCompositionPlan returns the CompositionPlan field if non-nil, zero value otherwise.

### GetCompositionPlanOk

`func (o *MusicGenerateRequestElevenlabs) GetCompositionPlanOk() (*map[string]interface{}, bool)`

GetCompositionPlanOk returns a tuple with the CompositionPlan field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCompositionPlan

`func (o *MusicGenerateRequestElevenlabs) SetCompositionPlan(v map[string]interface{})`

SetCompositionPlan sets CompositionPlan field to given value.

### HasCompositionPlan

`func (o *MusicGenerateRequestElevenlabs) HasCompositionPlan() bool`

HasCompositionPlan returns a boolean if a field has been set.

### GetMusicLengthMs

`func (o *MusicGenerateRequestElevenlabs) GetMusicLengthMs() int32`

GetMusicLengthMs returns the MusicLengthMs field if non-nil, zero value otherwise.

### GetMusicLengthMsOk

`func (o *MusicGenerateRequestElevenlabs) GetMusicLengthMsOk() (*int32, bool)`

GetMusicLengthMsOk returns a tuple with the MusicLengthMs field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMusicLengthMs

`func (o *MusicGenerateRequestElevenlabs) SetMusicLengthMs(v int32)`

SetMusicLengthMs sets MusicLengthMs field to given value.

### HasMusicLengthMs

`func (o *MusicGenerateRequestElevenlabs) HasMusicLengthMs() bool`

HasMusicLengthMs returns a boolean if a field has been set.

### GetModelId

`func (o *MusicGenerateRequestElevenlabs) GetModelId() string`

GetModelId returns the ModelId field if non-nil, zero value otherwise.

### GetModelIdOk

`func (o *MusicGenerateRequestElevenlabs) GetModelIdOk() (*string, bool)`

GetModelIdOk returns a tuple with the ModelId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModelId

`func (o *MusicGenerateRequestElevenlabs) SetModelId(v string)`

SetModelId sets ModelId field to given value.

### HasModelId

`func (o *MusicGenerateRequestElevenlabs) HasModelId() bool`

HasModelId returns a boolean if a field has been set.

### GetForceInstrumental

`func (o *MusicGenerateRequestElevenlabs) GetForceInstrumental() bool`

GetForceInstrumental returns the ForceInstrumental field if non-nil, zero value otherwise.

### GetForceInstrumentalOk

`func (o *MusicGenerateRequestElevenlabs) GetForceInstrumentalOk() (*bool, bool)`

GetForceInstrumentalOk returns a tuple with the ForceInstrumental field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetForceInstrumental

`func (o *MusicGenerateRequestElevenlabs) SetForceInstrumental(v bool)`

SetForceInstrumental sets ForceInstrumental field to given value.

### HasForceInstrumental

`func (o *MusicGenerateRequestElevenlabs) HasForceInstrumental() bool`

HasForceInstrumental returns a boolean if a field has been set.

### GetStoreForInpainting

`func (o *MusicGenerateRequestElevenlabs) GetStoreForInpainting() bool`

GetStoreForInpainting returns the StoreForInpainting field if non-nil, zero value otherwise.

### GetStoreForInpaintingOk

`func (o *MusicGenerateRequestElevenlabs) GetStoreForInpaintingOk() (*bool, bool)`

GetStoreForInpaintingOk returns a tuple with the StoreForInpainting field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStoreForInpainting

`func (o *MusicGenerateRequestElevenlabs) SetStoreForInpainting(v bool)`

SetStoreForInpainting sets StoreForInpainting field to given value.

### HasStoreForInpainting

`func (o *MusicGenerateRequestElevenlabs) HasStoreForInpainting() bool`

HasStoreForInpainting returns a boolean if a field has been set.

### GetWithTimestamps

`func (o *MusicGenerateRequestElevenlabs) GetWithTimestamps() bool`

GetWithTimestamps returns the WithTimestamps field if non-nil, zero value otherwise.

### GetWithTimestampsOk

`func (o *MusicGenerateRequestElevenlabs) GetWithTimestampsOk() (*bool, bool)`

GetWithTimestampsOk returns a tuple with the WithTimestamps field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetWithTimestamps

`func (o *MusicGenerateRequestElevenlabs) SetWithTimestamps(v bool)`

SetWithTimestamps sets WithTimestamps field to given value.

### HasWithTimestamps

`func (o *MusicGenerateRequestElevenlabs) HasWithTimestamps() bool`

HasWithTimestamps returns a boolean if a field has been set.

### GetSignWithC2pa

`func (o *MusicGenerateRequestElevenlabs) GetSignWithC2pa() bool`

GetSignWithC2pa returns the SignWithC2pa field if non-nil, zero value otherwise.

### GetSignWithC2paOk

`func (o *MusicGenerateRequestElevenlabs) GetSignWithC2paOk() (*bool, bool)`

GetSignWithC2paOk returns a tuple with the SignWithC2pa field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSignWithC2pa

`func (o *MusicGenerateRequestElevenlabs) SetSignWithC2pa(v bool)`

SetSignWithC2pa sets SignWithC2pa field to given value.

### HasSignWithC2pa

`func (o *MusicGenerateRequestElevenlabs) HasSignWithC2pa() bool`

HasSignWithC2pa returns a boolean if a field has been set.

### GetOutputFormat

`func (o *MusicGenerateRequestElevenlabs) GetOutputFormat() string`

GetOutputFormat returns the OutputFormat field if non-nil, zero value otherwise.

### GetOutputFormatOk

`func (o *MusicGenerateRequestElevenlabs) GetOutputFormatOk() (*string, bool)`

GetOutputFormatOk returns a tuple with the OutputFormat field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOutputFormat

`func (o *MusicGenerateRequestElevenlabs) SetOutputFormat(v string)`

SetOutputFormat sets OutputFormat field to given value.

### HasOutputFormat

`func (o *MusicGenerateRequestElevenlabs) HasOutputFormat() bool`

HasOutputFormat returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


