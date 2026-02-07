# ChatCompletionsResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | Pointer to **string** |  | [optional] 
**Object** | Pointer to **string** |  | [optional] 
**Created** | Pointer to **int32** |  | [optional] 
**Model** | Pointer to **string** |  | [optional] 
**Choices** | Pointer to [**[]ChatChoice**](ChatChoice.md) |  | [optional] 
**Usage** | Pointer to [**Usage**](Usage.md) |  | [optional] 

## Methods

### NewChatCompletionsResponse

`func NewChatCompletionsResponse() *ChatCompletionsResponse`

NewChatCompletionsResponse instantiates a new ChatCompletionsResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewChatCompletionsResponseWithDefaults

`func NewChatCompletionsResponseWithDefaults() *ChatCompletionsResponse`

NewChatCompletionsResponseWithDefaults instantiates a new ChatCompletionsResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *ChatCompletionsResponse) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *ChatCompletionsResponse) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *ChatCompletionsResponse) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *ChatCompletionsResponse) HasId() bool`

HasId returns a boolean if a field has been set.

### GetObject

`func (o *ChatCompletionsResponse) GetObject() string`

GetObject returns the Object field if non-nil, zero value otherwise.

### GetObjectOk

`func (o *ChatCompletionsResponse) GetObjectOk() (*string, bool)`

GetObjectOk returns a tuple with the Object field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetObject

`func (o *ChatCompletionsResponse) SetObject(v string)`

SetObject sets Object field to given value.

### HasObject

`func (o *ChatCompletionsResponse) HasObject() bool`

HasObject returns a boolean if a field has been set.

### GetCreated

`func (o *ChatCompletionsResponse) GetCreated() int32`

GetCreated returns the Created field if non-nil, zero value otherwise.

### GetCreatedOk

`func (o *ChatCompletionsResponse) GetCreatedOk() (*int32, bool)`

GetCreatedOk returns a tuple with the Created field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCreated

`func (o *ChatCompletionsResponse) SetCreated(v int32)`

SetCreated sets Created field to given value.

### HasCreated

`func (o *ChatCompletionsResponse) HasCreated() bool`

HasCreated returns a boolean if a field has been set.

### GetModel

`func (o *ChatCompletionsResponse) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *ChatCompletionsResponse) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *ChatCompletionsResponse) SetModel(v string)`

SetModel sets Model field to given value.

### HasModel

`func (o *ChatCompletionsResponse) HasModel() bool`

HasModel returns a boolean if a field has been set.

### GetChoices

`func (o *ChatCompletionsResponse) GetChoices() []ChatChoice`

GetChoices returns the Choices field if non-nil, zero value otherwise.

### GetChoicesOk

`func (o *ChatCompletionsResponse) GetChoicesOk() (*[]ChatChoice, bool)`

GetChoicesOk returns a tuple with the Choices field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetChoices

`func (o *ChatCompletionsResponse) SetChoices(v []ChatChoice)`

SetChoices sets Choices field to given value.

### HasChoices

`func (o *ChatCompletionsResponse) HasChoices() bool`

HasChoices returns a boolean if a field has been set.

### GetUsage

`func (o *ChatCompletionsResponse) GetUsage() Usage`

GetUsage returns the Usage field if non-nil, zero value otherwise.

### GetUsageOk

`func (o *ChatCompletionsResponse) GetUsageOk() (*Usage, bool)`

GetUsageOk returns a tuple with the Usage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUsage

`func (o *ChatCompletionsResponse) SetUsage(v Usage)`

SetUsage sets Usage field to given value.

### HasUsage

`func (o *ChatCompletionsResponse) HasUsage() bool`

HasUsage returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


