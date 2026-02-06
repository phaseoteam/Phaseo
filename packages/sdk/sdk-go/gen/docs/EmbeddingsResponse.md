# EmbeddingsResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Object** | Pointer to **string** |  | [optional] 
**Data** | Pointer to [**[]Embedding**](Embedding.md) |  | [optional] 
**Model** | Pointer to **string** |  | [optional] 
**Usage** | Pointer to [**Usage**](Usage.md) |  | [optional] 

## Methods

### NewEmbeddingsResponse

`func NewEmbeddingsResponse() *EmbeddingsResponse`

NewEmbeddingsResponse instantiates a new EmbeddingsResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewEmbeddingsResponseWithDefaults

`func NewEmbeddingsResponseWithDefaults() *EmbeddingsResponse`

NewEmbeddingsResponseWithDefaults instantiates a new EmbeddingsResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetObject

`func (o *EmbeddingsResponse) GetObject() string`

GetObject returns the Object field if non-nil, zero value otherwise.

### GetObjectOk

`func (o *EmbeddingsResponse) GetObjectOk() (*string, bool)`

GetObjectOk returns a tuple with the Object field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetObject

`func (o *EmbeddingsResponse) SetObject(v string)`

SetObject sets Object field to given value.

### HasObject

`func (o *EmbeddingsResponse) HasObject() bool`

HasObject returns a boolean if a field has been set.

### GetData

`func (o *EmbeddingsResponse) GetData() []Embedding`

GetData returns the Data field if non-nil, zero value otherwise.

### GetDataOk

`func (o *EmbeddingsResponse) GetDataOk() (*[]Embedding, bool)`

GetDataOk returns a tuple with the Data field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetData

`func (o *EmbeddingsResponse) SetData(v []Embedding)`

SetData sets Data field to given value.

### HasData

`func (o *EmbeddingsResponse) HasData() bool`

HasData returns a boolean if a field has been set.

### GetModel

`func (o *EmbeddingsResponse) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *EmbeddingsResponse) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *EmbeddingsResponse) SetModel(v string)`

SetModel sets Model field to given value.

### HasModel

`func (o *EmbeddingsResponse) HasModel() bool`

HasModel returns a boolean if a field has been set.

### GetUsage

`func (o *EmbeddingsResponse) GetUsage() Usage`

GetUsage returns the Usage field if non-nil, zero value otherwise.

### GetUsageOk

`func (o *EmbeddingsResponse) GetUsageOk() (*Usage, bool)`

GetUsageOk returns a tuple with the Usage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUsage

`func (o *EmbeddingsResponse) SetUsage(v Usage)`

SetUsage sets Usage field to given value.

### HasUsage

`func (o *EmbeddingsResponse) HasUsage() bool`

HasUsage returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


