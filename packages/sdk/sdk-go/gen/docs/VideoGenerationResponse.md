# VideoGenerationResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | Pointer to **string** |  | [optional] 
**Model** | Pointer to **string** |  | [optional] 
**Status** | Pointer to **string** |  | [optional] 
**Created** | Pointer to **int32** |  | [optional] 
**Object** | Pointer to **string** |  | [optional] 
**Output** | Pointer to [**[]VideoGenerationResponseOutputInner**](VideoGenerationResponseOutputInner.md) |  | [optional] 

## Methods

### NewVideoGenerationResponse

`func NewVideoGenerationResponse() *VideoGenerationResponse`

NewVideoGenerationResponse instantiates a new VideoGenerationResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewVideoGenerationResponseWithDefaults

`func NewVideoGenerationResponseWithDefaults() *VideoGenerationResponse`

NewVideoGenerationResponseWithDefaults instantiates a new VideoGenerationResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *VideoGenerationResponse) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *VideoGenerationResponse) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *VideoGenerationResponse) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *VideoGenerationResponse) HasId() bool`

HasId returns a boolean if a field has been set.

### GetModel

`func (o *VideoGenerationResponse) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *VideoGenerationResponse) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *VideoGenerationResponse) SetModel(v string)`

SetModel sets Model field to given value.

### HasModel

`func (o *VideoGenerationResponse) HasModel() bool`

HasModel returns a boolean if a field has been set.

### GetStatus

`func (o *VideoGenerationResponse) GetStatus() string`

GetStatus returns the Status field if non-nil, zero value otherwise.

### GetStatusOk

`func (o *VideoGenerationResponse) GetStatusOk() (*string, bool)`

GetStatusOk returns a tuple with the Status field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStatus

`func (o *VideoGenerationResponse) SetStatus(v string)`

SetStatus sets Status field to given value.

### HasStatus

`func (o *VideoGenerationResponse) HasStatus() bool`

HasStatus returns a boolean if a field has been set.

### GetCreated

`func (o *VideoGenerationResponse) GetCreated() int32`

GetCreated returns the Created field if non-nil, zero value otherwise.

### GetCreatedOk

`func (o *VideoGenerationResponse) GetCreatedOk() (*int32, bool)`

GetCreatedOk returns a tuple with the Created field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCreated

`func (o *VideoGenerationResponse) SetCreated(v int32)`

SetCreated sets Created field to given value.

### HasCreated

`func (o *VideoGenerationResponse) HasCreated() bool`

HasCreated returns a boolean if a field has been set.

### GetObject

`func (o *VideoGenerationResponse) GetObject() string`

GetObject returns the Object field if non-nil, zero value otherwise.

### GetObjectOk

`func (o *VideoGenerationResponse) GetObjectOk() (*string, bool)`

GetObjectOk returns a tuple with the Object field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetObject

`func (o *VideoGenerationResponse) SetObject(v string)`

SetObject sets Object field to given value.

### HasObject

`func (o *VideoGenerationResponse) HasObject() bool`

HasObject returns a boolean if a field has been set.

### GetOutput

`func (o *VideoGenerationResponse) GetOutput() []VideoGenerationResponseOutputInner`

GetOutput returns the Output field if non-nil, zero value otherwise.

### GetOutputOk

`func (o *VideoGenerationResponse) GetOutputOk() (*[]VideoGenerationResponseOutputInner, bool)`

GetOutputOk returns a tuple with the Output field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOutput

`func (o *VideoGenerationResponse) SetOutput(v []VideoGenerationResponseOutputInner)`

SetOutput sets Output field to given value.

### HasOutput

`func (o *VideoGenerationResponse) HasOutput() bool`

HasOutput returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


