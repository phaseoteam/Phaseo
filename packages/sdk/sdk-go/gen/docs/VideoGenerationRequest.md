# VideoGenerationRequest

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Model** | **string** |  | 
**Prompt** | **string** |  | 
**Seconds** | Pointer to [**VideoGenerationRequestSeconds**](VideoGenerationRequestSeconds.md) |  | [optional] 
**Size** | Pointer to **string** |  | [optional] 
**InputReference** | Pointer to **string** |  | [optional] 
**InputReferenceMimeType** | Pointer to **string** |  | [optional] 
**Duration** | Pointer to **int32** |  | [optional] 
**DurationSeconds** | Pointer to **int32** |  | [optional] 
**Ratio** | Pointer to **string** |  | [optional] 
**AspectRatio** | Pointer to **string** |  | [optional] 
**Resolution** | Pointer to **string** |  | [optional] 
**NegativePrompt** | Pointer to **string** |  | [optional] 
**SampleCount** | Pointer to **int32** |  | [optional] 
**Seed** | Pointer to **int32** |  | [optional] 
**PersonGeneration** | Pointer to **string** |  | [optional] 
**OutputStorageUri** | Pointer to **string** |  | [optional] 
**Debug** | Pointer to [**DebugOptions**](DebugOptions.md) |  | [optional] 
**Provider** | Pointer to [**ProviderRoutingOptions**](ProviderRoutingOptions.md) |  | [optional] 

## Methods

### NewVideoGenerationRequest

`func NewVideoGenerationRequest(model string, prompt string, ) *VideoGenerationRequest`

NewVideoGenerationRequest instantiates a new VideoGenerationRequest object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewVideoGenerationRequestWithDefaults

`func NewVideoGenerationRequestWithDefaults() *VideoGenerationRequest`

NewVideoGenerationRequestWithDefaults instantiates a new VideoGenerationRequest object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetModel

`func (o *VideoGenerationRequest) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *VideoGenerationRequest) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *VideoGenerationRequest) SetModel(v string)`

SetModel sets Model field to given value.


### GetPrompt

`func (o *VideoGenerationRequest) GetPrompt() string`

GetPrompt returns the Prompt field if non-nil, zero value otherwise.

### GetPromptOk

`func (o *VideoGenerationRequest) GetPromptOk() (*string, bool)`

GetPromptOk returns a tuple with the Prompt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPrompt

`func (o *VideoGenerationRequest) SetPrompt(v string)`

SetPrompt sets Prompt field to given value.


### GetSeconds

`func (o *VideoGenerationRequest) GetSeconds() VideoGenerationRequestSeconds`

GetSeconds returns the Seconds field if non-nil, zero value otherwise.

### GetSecondsOk

`func (o *VideoGenerationRequest) GetSecondsOk() (*VideoGenerationRequestSeconds, bool)`

GetSecondsOk returns a tuple with the Seconds field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSeconds

`func (o *VideoGenerationRequest) SetSeconds(v VideoGenerationRequestSeconds)`

SetSeconds sets Seconds field to given value.

### HasSeconds

`func (o *VideoGenerationRequest) HasSeconds() bool`

HasSeconds returns a boolean if a field has been set.

### GetSize

`func (o *VideoGenerationRequest) GetSize() string`

GetSize returns the Size field if non-nil, zero value otherwise.

### GetSizeOk

`func (o *VideoGenerationRequest) GetSizeOk() (*string, bool)`

GetSizeOk returns a tuple with the Size field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSize

`func (o *VideoGenerationRequest) SetSize(v string)`

SetSize sets Size field to given value.

### HasSize

`func (o *VideoGenerationRequest) HasSize() bool`

HasSize returns a boolean if a field has been set.

### GetInputReference

`func (o *VideoGenerationRequest) GetInputReference() string`

GetInputReference returns the InputReference field if non-nil, zero value otherwise.

### GetInputReferenceOk

`func (o *VideoGenerationRequest) GetInputReferenceOk() (*string, bool)`

GetInputReferenceOk returns a tuple with the InputReference field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputReference

`func (o *VideoGenerationRequest) SetInputReference(v string)`

SetInputReference sets InputReference field to given value.

### HasInputReference

`func (o *VideoGenerationRequest) HasInputReference() bool`

HasInputReference returns a boolean if a field has been set.

### GetInputReferenceMimeType

`func (o *VideoGenerationRequest) GetInputReferenceMimeType() string`

GetInputReferenceMimeType returns the InputReferenceMimeType field if non-nil, zero value otherwise.

### GetInputReferenceMimeTypeOk

`func (o *VideoGenerationRequest) GetInputReferenceMimeTypeOk() (*string, bool)`

GetInputReferenceMimeTypeOk returns a tuple with the InputReferenceMimeType field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputReferenceMimeType

`func (o *VideoGenerationRequest) SetInputReferenceMimeType(v string)`

SetInputReferenceMimeType sets InputReferenceMimeType field to given value.

### HasInputReferenceMimeType

`func (o *VideoGenerationRequest) HasInputReferenceMimeType() bool`

HasInputReferenceMimeType returns a boolean if a field has been set.

### GetDuration

`func (o *VideoGenerationRequest) GetDuration() int32`

GetDuration returns the Duration field if non-nil, zero value otherwise.

### GetDurationOk

`func (o *VideoGenerationRequest) GetDurationOk() (*int32, bool)`

GetDurationOk returns a tuple with the Duration field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDuration

`func (o *VideoGenerationRequest) SetDuration(v int32)`

SetDuration sets Duration field to given value.

### HasDuration

`func (o *VideoGenerationRequest) HasDuration() bool`

HasDuration returns a boolean if a field has been set.

### GetDurationSeconds

`func (o *VideoGenerationRequest) GetDurationSeconds() int32`

GetDurationSeconds returns the DurationSeconds field if non-nil, zero value otherwise.

### GetDurationSecondsOk

`func (o *VideoGenerationRequest) GetDurationSecondsOk() (*int32, bool)`

GetDurationSecondsOk returns a tuple with the DurationSeconds field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDurationSeconds

`func (o *VideoGenerationRequest) SetDurationSeconds(v int32)`

SetDurationSeconds sets DurationSeconds field to given value.

### HasDurationSeconds

`func (o *VideoGenerationRequest) HasDurationSeconds() bool`

HasDurationSeconds returns a boolean if a field has been set.

### GetRatio

`func (o *VideoGenerationRequest) GetRatio() string`

GetRatio returns the Ratio field if non-nil, zero value otherwise.

### GetRatioOk

`func (o *VideoGenerationRequest) GetRatioOk() (*string, bool)`

GetRatioOk returns a tuple with the Ratio field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRatio

`func (o *VideoGenerationRequest) SetRatio(v string)`

SetRatio sets Ratio field to given value.

### HasRatio

`func (o *VideoGenerationRequest) HasRatio() bool`

HasRatio returns a boolean if a field has been set.

### GetAspectRatio

`func (o *VideoGenerationRequest) GetAspectRatio() string`

GetAspectRatio returns the AspectRatio field if non-nil, zero value otherwise.

### GetAspectRatioOk

`func (o *VideoGenerationRequest) GetAspectRatioOk() (*string, bool)`

GetAspectRatioOk returns a tuple with the AspectRatio field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetAspectRatio

`func (o *VideoGenerationRequest) SetAspectRatio(v string)`

SetAspectRatio sets AspectRatio field to given value.

### HasAspectRatio

`func (o *VideoGenerationRequest) HasAspectRatio() bool`

HasAspectRatio returns a boolean if a field has been set.

### GetResolution

`func (o *VideoGenerationRequest) GetResolution() string`

GetResolution returns the Resolution field if non-nil, zero value otherwise.

### GetResolutionOk

`func (o *VideoGenerationRequest) GetResolutionOk() (*string, bool)`

GetResolutionOk returns a tuple with the Resolution field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetResolution

`func (o *VideoGenerationRequest) SetResolution(v string)`

SetResolution sets Resolution field to given value.

### HasResolution

`func (o *VideoGenerationRequest) HasResolution() bool`

HasResolution returns a boolean if a field has been set.

### GetNegativePrompt

`func (o *VideoGenerationRequest) GetNegativePrompt() string`

GetNegativePrompt returns the NegativePrompt field if non-nil, zero value otherwise.

### GetNegativePromptOk

`func (o *VideoGenerationRequest) GetNegativePromptOk() (*string, bool)`

GetNegativePromptOk returns a tuple with the NegativePrompt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetNegativePrompt

`func (o *VideoGenerationRequest) SetNegativePrompt(v string)`

SetNegativePrompt sets NegativePrompt field to given value.

### HasNegativePrompt

`func (o *VideoGenerationRequest) HasNegativePrompt() bool`

HasNegativePrompt returns a boolean if a field has been set.

### GetSampleCount

`func (o *VideoGenerationRequest) GetSampleCount() int32`

GetSampleCount returns the SampleCount field if non-nil, zero value otherwise.

### GetSampleCountOk

`func (o *VideoGenerationRequest) GetSampleCountOk() (*int32, bool)`

GetSampleCountOk returns a tuple with the SampleCount field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSampleCount

`func (o *VideoGenerationRequest) SetSampleCount(v int32)`

SetSampleCount sets SampleCount field to given value.

### HasSampleCount

`func (o *VideoGenerationRequest) HasSampleCount() bool`

HasSampleCount returns a boolean if a field has been set.

### GetSeed

`func (o *VideoGenerationRequest) GetSeed() int32`

GetSeed returns the Seed field if non-nil, zero value otherwise.

### GetSeedOk

`func (o *VideoGenerationRequest) GetSeedOk() (*int32, bool)`

GetSeedOk returns a tuple with the Seed field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetSeed

`func (o *VideoGenerationRequest) SetSeed(v int32)`

SetSeed sets Seed field to given value.

### HasSeed

`func (o *VideoGenerationRequest) HasSeed() bool`

HasSeed returns a boolean if a field has been set.

### GetPersonGeneration

`func (o *VideoGenerationRequest) GetPersonGeneration() string`

GetPersonGeneration returns the PersonGeneration field if non-nil, zero value otherwise.

### GetPersonGenerationOk

`func (o *VideoGenerationRequest) GetPersonGenerationOk() (*string, bool)`

GetPersonGenerationOk returns a tuple with the PersonGeneration field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPersonGeneration

`func (o *VideoGenerationRequest) SetPersonGeneration(v string)`

SetPersonGeneration sets PersonGeneration field to given value.

### HasPersonGeneration

`func (o *VideoGenerationRequest) HasPersonGeneration() bool`

HasPersonGeneration returns a boolean if a field has been set.

### GetOutputStorageUri

`func (o *VideoGenerationRequest) GetOutputStorageUri() string`

GetOutputStorageUri returns the OutputStorageUri field if non-nil, zero value otherwise.

### GetOutputStorageUriOk

`func (o *VideoGenerationRequest) GetOutputStorageUriOk() (*string, bool)`

GetOutputStorageUriOk returns a tuple with the OutputStorageUri field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOutputStorageUri

`func (o *VideoGenerationRequest) SetOutputStorageUri(v string)`

SetOutputStorageUri sets OutputStorageUri field to given value.

### HasOutputStorageUri

`func (o *VideoGenerationRequest) HasOutputStorageUri() bool`

HasOutputStorageUri returns a boolean if a field has been set.

### GetDebug

`func (o *VideoGenerationRequest) GetDebug() DebugOptions`

GetDebug returns the Debug field if non-nil, zero value otherwise.

### GetDebugOk

`func (o *VideoGenerationRequest) GetDebugOk() (*DebugOptions, bool)`

GetDebugOk returns a tuple with the Debug field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDebug

`func (o *VideoGenerationRequest) SetDebug(v DebugOptions)`

SetDebug sets Debug field to given value.

### HasDebug

`func (o *VideoGenerationRequest) HasDebug() bool`

HasDebug returns a boolean if a field has been set.

### GetProvider

`func (o *VideoGenerationRequest) GetProvider() ProviderRoutingOptions`

GetProvider returns the Provider field if non-nil, zero value otherwise.

### GetProviderOk

`func (o *VideoGenerationRequest) GetProviderOk() (*ProviderRoutingOptions, bool)`

GetProviderOk returns a tuple with the Provider field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetProvider

`func (o *VideoGenerationRequest) SetProvider(v ProviderRoutingOptions)`

SetProvider sets Provider field to given value.

### HasProvider

`func (o *VideoGenerationRequest) HasProvider() bool`

HasProvider returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


