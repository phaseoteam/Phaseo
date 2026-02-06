# AudioContentPart

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Type** | **string** |  | 
**InputAudio** | [**AudioContentPartInputAudio**](AudioContentPartInputAudio.md) |  | 

## Methods

### NewAudioContentPart

`func NewAudioContentPart(type_ string, inputAudio AudioContentPartInputAudio, ) *AudioContentPart`

NewAudioContentPart instantiates a new AudioContentPart object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewAudioContentPartWithDefaults

`func NewAudioContentPartWithDefaults() *AudioContentPart`

NewAudioContentPartWithDefaults instantiates a new AudioContentPart object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetType

`func (o *AudioContentPart) GetType() string`

GetType returns the Type field if non-nil, zero value otherwise.

### GetTypeOk

`func (o *AudioContentPart) GetTypeOk() (*string, bool)`

GetTypeOk returns a tuple with the Type field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetType

`func (o *AudioContentPart) SetType(v string)`

SetType sets Type field to given value.


### GetInputAudio

`func (o *AudioContentPart) GetInputAudio() AudioContentPartInputAudio`

GetInputAudio returns the InputAudio field if non-nil, zero value otherwise.

### GetInputAudioOk

`func (o *AudioContentPart) GetInputAudioOk() (*AudioContentPartInputAudio, bool)`

GetInputAudioOk returns a tuple with the InputAudio field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputAudio

`func (o *AudioContentPart) SetInputAudio(v AudioContentPartInputAudio)`

SetInputAudio sets InputAudio field to given value.



[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


