# ImagesGenerationResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Created** | Pointer to **int32** |  | [optional] 
**Data** | Pointer to [**[]Image**](Image.md) |  | [optional] 

## Methods

### NewImagesGenerationResponse

`func NewImagesGenerationResponse() *ImagesGenerationResponse`

NewImagesGenerationResponse instantiates a new ImagesGenerationResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewImagesGenerationResponseWithDefaults

`func NewImagesGenerationResponseWithDefaults() *ImagesGenerationResponse`

NewImagesGenerationResponseWithDefaults instantiates a new ImagesGenerationResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetCreated

`func (o *ImagesGenerationResponse) GetCreated() int32`

GetCreated returns the Created field if non-nil, zero value otherwise.

### GetCreatedOk

`func (o *ImagesGenerationResponse) GetCreatedOk() (*int32, bool)`

GetCreatedOk returns a tuple with the Created field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCreated

`func (o *ImagesGenerationResponse) SetCreated(v int32)`

SetCreated sets Created field to given value.

### HasCreated

`func (o *ImagesGenerationResponse) HasCreated() bool`

HasCreated returns a boolean if a field has been set.

### GetData

`func (o *ImagesGenerationResponse) GetData() []Image`

GetData returns the Data field if non-nil, zero value otherwise.

### GetDataOk

`func (o *ImagesGenerationResponse) GetDataOk() (*[]Image, bool)`

GetDataOk returns a tuple with the Data field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetData

`func (o *ImagesGenerationResponse) SetData(v []Image)`

SetData sets Data field to given value.

### HasData

`func (o *ImagesGenerationResponse) HasData() bool`

HasData returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


