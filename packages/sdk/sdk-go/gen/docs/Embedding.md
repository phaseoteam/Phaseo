# Embedding

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Object** | Pointer to **string** |  | [optional] 
**Embedding** | Pointer to **[]float32** |  | [optional] 
**Index** | Pointer to **int32** |  | [optional] 

## Methods

### NewEmbedding

`func NewEmbedding() *Embedding`

NewEmbedding instantiates a new Embedding object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewEmbeddingWithDefaults

`func NewEmbeddingWithDefaults() *Embedding`

NewEmbeddingWithDefaults instantiates a new Embedding object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetObject

`func (o *Embedding) GetObject() string`

GetObject returns the Object field if non-nil, zero value otherwise.

### GetObjectOk

`func (o *Embedding) GetObjectOk() (*string, bool)`

GetObjectOk returns a tuple with the Object field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetObject

`func (o *Embedding) SetObject(v string)`

SetObject sets Object field to given value.

### HasObject

`func (o *Embedding) HasObject() bool`

HasObject returns a boolean if a field has been set.

### GetEmbedding

`func (o *Embedding) GetEmbedding() []float32`

GetEmbedding returns the Embedding field if non-nil, zero value otherwise.

### GetEmbeddingOk

`func (o *Embedding) GetEmbeddingOk() (*[]float32, bool)`

GetEmbeddingOk returns a tuple with the Embedding field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEmbedding

`func (o *Embedding) SetEmbedding(v []float32)`

SetEmbedding sets Embedding field to given value.

### HasEmbedding

`func (o *Embedding) HasEmbedding() bool`

HasEmbedding returns a boolean if a field has been set.

### GetIndex

`func (o *Embedding) GetIndex() int32`

GetIndex returns the Index field if non-nil, zero value otherwise.

### GetIndexOk

`func (o *Embedding) GetIndexOk() (*int32, bool)`

GetIndexOk returns a tuple with the Index field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetIndex

`func (o *Embedding) SetIndex(v int32)`

SetIndex sets Index field to given value.

### HasIndex

`func (o *Embedding) HasIndex() bool`

HasIndex returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


