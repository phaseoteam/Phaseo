# ListFilesResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Object** | Pointer to **string** |  | [optional] 
**Data** | Pointer to [**[]FileResponse**](FileResponse.md) |  | [optional] 

## Methods

### NewListFilesResponse

`func NewListFilesResponse() *ListFilesResponse`

NewListFilesResponse instantiates a new ListFilesResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewListFilesResponseWithDefaults

`func NewListFilesResponseWithDefaults() *ListFilesResponse`

NewListFilesResponseWithDefaults instantiates a new ListFilesResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetObject

`func (o *ListFilesResponse) GetObject() string`

GetObject returns the Object field if non-nil, zero value otherwise.

### GetObjectOk

`func (o *ListFilesResponse) GetObjectOk() (*string, bool)`

GetObjectOk returns a tuple with the Object field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetObject

`func (o *ListFilesResponse) SetObject(v string)`

SetObject sets Object field to given value.

### HasObject

`func (o *ListFilesResponse) HasObject() bool`

HasObject returns a boolean if a field has been set.

### GetData

`func (o *ListFilesResponse) GetData() []FileResponse`

GetData returns the Data field if non-nil, zero value otherwise.

### GetDataOk

`func (o *ListFilesResponse) GetDataOk() (*[]FileResponse, bool)`

GetDataOk returns a tuple with the Data field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetData

`func (o *ListFilesResponse) SetData(v []FileResponse)`

SetData sets Data field to given value.

### HasData

`func (o *ListFilesResponse) HasData() bool`

HasData returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


