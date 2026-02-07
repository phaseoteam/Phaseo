# ResponsesResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | Pointer to **string** |  | [optional] 
**Object** | Pointer to **string** |  | [optional] 
**Created** | Pointer to **int32** |  | [optional] 
**Model** | Pointer to **string** |  | [optional] 
**Content** | Pointer to **[]map[string]interface{}** |  | [optional] 
**Role** | Pointer to **string** |  | [optional] 
**StopReason** | Pointer to **string** |  | [optional] 
**Type** | Pointer to **string** |  | [optional] 
**Usage** | Pointer to [**Usage**](Usage.md) |  | [optional] 

## Methods

### NewResponsesResponse

`func NewResponsesResponse() *ResponsesResponse`

NewResponsesResponse instantiates a new ResponsesResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewResponsesResponseWithDefaults

`func NewResponsesResponseWithDefaults() *ResponsesResponse`

NewResponsesResponseWithDefaults instantiates a new ResponsesResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *ResponsesResponse) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *ResponsesResponse) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *ResponsesResponse) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *ResponsesResponse) HasId() bool`

HasId returns a boolean if a field has been set.

### GetObject

`func (o *ResponsesResponse) GetObject() string`

GetObject returns the Object field if non-nil, zero value otherwise.

### GetObjectOk

`func (o *ResponsesResponse) GetObjectOk() (*string, bool)`

GetObjectOk returns a tuple with the Object field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetObject

`func (o *ResponsesResponse) SetObject(v string)`

SetObject sets Object field to given value.

### HasObject

`func (o *ResponsesResponse) HasObject() bool`

HasObject returns a boolean if a field has been set.

### GetCreated

`func (o *ResponsesResponse) GetCreated() int32`

GetCreated returns the Created field if non-nil, zero value otherwise.

### GetCreatedOk

`func (o *ResponsesResponse) GetCreatedOk() (*int32, bool)`

GetCreatedOk returns a tuple with the Created field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCreated

`func (o *ResponsesResponse) SetCreated(v int32)`

SetCreated sets Created field to given value.

### HasCreated

`func (o *ResponsesResponse) HasCreated() bool`

HasCreated returns a boolean if a field has been set.

### GetModel

`func (o *ResponsesResponse) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *ResponsesResponse) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *ResponsesResponse) SetModel(v string)`

SetModel sets Model field to given value.

### HasModel

`func (o *ResponsesResponse) HasModel() bool`

HasModel returns a boolean if a field has been set.

### GetContent

`func (o *ResponsesResponse) GetContent() []map[string]interface{}`

GetContent returns the Content field if non-nil, zero value otherwise.

### GetContentOk

`func (o *ResponsesResponse) GetContentOk() (*[]map[string]interface{}, bool)`

GetContentOk returns a tuple with the Content field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContent

`func (o *ResponsesResponse) SetContent(v []map[string]interface{})`

SetContent sets Content field to given value.

### HasContent

`func (o *ResponsesResponse) HasContent() bool`

HasContent returns a boolean if a field has been set.

### GetRole

`func (o *ResponsesResponse) GetRole() string`

GetRole returns the Role field if non-nil, zero value otherwise.

### GetRoleOk

`func (o *ResponsesResponse) GetRoleOk() (*string, bool)`

GetRoleOk returns a tuple with the Role field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRole

`func (o *ResponsesResponse) SetRole(v string)`

SetRole sets Role field to given value.

### HasRole

`func (o *ResponsesResponse) HasRole() bool`

HasRole returns a boolean if a field has been set.

### GetStopReason

`func (o *ResponsesResponse) GetStopReason() string`

GetStopReason returns the StopReason field if non-nil, zero value otherwise.

### GetStopReasonOk

`func (o *ResponsesResponse) GetStopReasonOk() (*string, bool)`

GetStopReasonOk returns a tuple with the StopReason field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStopReason

`func (o *ResponsesResponse) SetStopReason(v string)`

SetStopReason sets StopReason field to given value.

### HasStopReason

`func (o *ResponsesResponse) HasStopReason() bool`

HasStopReason returns a boolean if a field has been set.

### GetType

`func (o *ResponsesResponse) GetType() string`

GetType returns the Type field if non-nil, zero value otherwise.

### GetTypeOk

`func (o *ResponsesResponse) GetTypeOk() (*string, bool)`

GetTypeOk returns a tuple with the Type field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetType

`func (o *ResponsesResponse) SetType(v string)`

SetType sets Type field to given value.

### HasType

`func (o *ResponsesResponse) HasType() bool`

HasType returns a boolean if a field has been set.

### GetUsage

`func (o *ResponsesResponse) GetUsage() Usage`

GetUsage returns the Usage field if non-nil, zero value otherwise.

### GetUsageOk

`func (o *ResponsesResponse) GetUsageOk() (*Usage, bool)`

GetUsageOk returns a tuple with the Usage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUsage

`func (o *ResponsesResponse) SetUsage(v Usage)`

SetUsage sets Usage field to given value.

### HasUsage

`func (o *ResponsesResponse) HasUsage() bool`

HasUsage returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


