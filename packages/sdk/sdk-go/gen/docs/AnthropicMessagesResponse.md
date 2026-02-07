# AnthropicMessagesResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | Pointer to **string** |  | [optional] 
**Type** | Pointer to **string** |  | [optional] 
**Role** | Pointer to **string** |  | [optional] 
**Model** | Pointer to **string** |  | [optional] 
**Content** | Pointer to [**[]AnthropicContentBlock**](AnthropicContentBlock.md) |  | [optional] 
**StopReason** | Pointer to **string** |  | [optional] 
**StopSequence** | Pointer to **string** |  | [optional] 
**Usage** | Pointer to [**AnthropicUsage**](AnthropicUsage.md) |  | [optional] 

## Methods

### NewAnthropicMessagesResponse

`func NewAnthropicMessagesResponse() *AnthropicMessagesResponse`

NewAnthropicMessagesResponse instantiates a new AnthropicMessagesResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewAnthropicMessagesResponseWithDefaults

`func NewAnthropicMessagesResponseWithDefaults() *AnthropicMessagesResponse`

NewAnthropicMessagesResponseWithDefaults instantiates a new AnthropicMessagesResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *AnthropicMessagesResponse) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *AnthropicMessagesResponse) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *AnthropicMessagesResponse) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *AnthropicMessagesResponse) HasId() bool`

HasId returns a boolean if a field has been set.

### GetType

`func (o *AnthropicMessagesResponse) GetType() string`

GetType returns the Type field if non-nil, zero value otherwise.

### GetTypeOk

`func (o *AnthropicMessagesResponse) GetTypeOk() (*string, bool)`

GetTypeOk returns a tuple with the Type field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetType

`func (o *AnthropicMessagesResponse) SetType(v string)`

SetType sets Type field to given value.

### HasType

`func (o *AnthropicMessagesResponse) HasType() bool`

HasType returns a boolean if a field has been set.

### GetRole

`func (o *AnthropicMessagesResponse) GetRole() string`

GetRole returns the Role field if non-nil, zero value otherwise.

### GetRoleOk

`func (o *AnthropicMessagesResponse) GetRoleOk() (*string, bool)`

GetRoleOk returns a tuple with the Role field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRole

`func (o *AnthropicMessagesResponse) SetRole(v string)`

SetRole sets Role field to given value.

### HasRole

`func (o *AnthropicMessagesResponse) HasRole() bool`

HasRole returns a boolean if a field has been set.

### GetModel

`func (o *AnthropicMessagesResponse) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *AnthropicMessagesResponse) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *AnthropicMessagesResponse) SetModel(v string)`

SetModel sets Model field to given value.

### HasModel

`func (o *AnthropicMessagesResponse) HasModel() bool`

HasModel returns a boolean if a field has been set.

### GetContent

`func (o *AnthropicMessagesResponse) GetContent() []AnthropicContentBlock`

GetContent returns the Content field if non-nil, zero value otherwise.

### GetContentOk

`func (o *AnthropicMessagesResponse) GetContentOk() (*[]AnthropicContentBlock, bool)`

GetContentOk returns a tuple with the Content field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContent

`func (o *AnthropicMessagesResponse) SetContent(v []AnthropicContentBlock)`

SetContent sets Content field to given value.

### HasContent

`func (o *AnthropicMessagesResponse) HasContent() bool`

HasContent returns a boolean if a field has been set.

### GetStopReason

`func (o *AnthropicMessagesResponse) GetStopReason() string`

GetStopReason returns the StopReason field if non-nil, zero value otherwise.

### GetStopReasonOk

`func (o *AnthropicMessagesResponse) GetStopReasonOk() (*string, bool)`

GetStopReasonOk returns a tuple with the StopReason field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStopReason

`func (o *AnthropicMessagesResponse) SetStopReason(v string)`

SetStopReason sets StopReason field to given value.

### HasStopReason

`func (o *AnthropicMessagesResponse) HasStopReason() bool`

HasStopReason returns a boolean if a field has been set.

### GetStopSequence

`func (o *AnthropicMessagesResponse) GetStopSequence() string`

GetStopSequence returns the StopSequence field if non-nil, zero value otherwise.

### GetStopSequenceOk

`func (o *AnthropicMessagesResponse) GetStopSequenceOk() (*string, bool)`

GetStopSequenceOk returns a tuple with the StopSequence field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStopSequence

`func (o *AnthropicMessagesResponse) SetStopSequence(v string)`

SetStopSequence sets StopSequence field to given value.

### HasStopSequence

`func (o *AnthropicMessagesResponse) HasStopSequence() bool`

HasStopSequence returns a boolean if a field has been set.

### GetUsage

`func (o *AnthropicMessagesResponse) GetUsage() AnthropicUsage`

GetUsage returns the Usage field if non-nil, zero value otherwise.

### GetUsageOk

`func (o *AnthropicMessagesResponse) GetUsageOk() (*AnthropicUsage, bool)`

GetUsageOk returns a tuple with the Usage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUsage

`func (o *AnthropicMessagesResponse) SetUsage(v AnthropicUsage)`

SetUsage sets Usage field to given value.

### HasUsage

`func (o *AnthropicMessagesResponse) HasUsage() bool`

HasUsage returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


