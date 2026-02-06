# AnthropicMessageStartEventDataMessage

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

### NewAnthropicMessageStartEventDataMessage

`func NewAnthropicMessageStartEventDataMessage() *AnthropicMessageStartEventDataMessage`

NewAnthropicMessageStartEventDataMessage instantiates a new AnthropicMessageStartEventDataMessage object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewAnthropicMessageStartEventDataMessageWithDefaults

`func NewAnthropicMessageStartEventDataMessageWithDefaults() *AnthropicMessageStartEventDataMessage`

NewAnthropicMessageStartEventDataMessageWithDefaults instantiates a new AnthropicMessageStartEventDataMessage object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *AnthropicMessageStartEventDataMessage) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *AnthropicMessageStartEventDataMessage) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *AnthropicMessageStartEventDataMessage) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *AnthropicMessageStartEventDataMessage) HasId() bool`

HasId returns a boolean if a field has been set.

### GetType

`func (o *AnthropicMessageStartEventDataMessage) GetType() string`

GetType returns the Type field if non-nil, zero value otherwise.

### GetTypeOk

`func (o *AnthropicMessageStartEventDataMessage) GetTypeOk() (*string, bool)`

GetTypeOk returns a tuple with the Type field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetType

`func (o *AnthropicMessageStartEventDataMessage) SetType(v string)`

SetType sets Type field to given value.

### HasType

`func (o *AnthropicMessageStartEventDataMessage) HasType() bool`

HasType returns a boolean if a field has been set.

### GetRole

`func (o *AnthropicMessageStartEventDataMessage) GetRole() string`

GetRole returns the Role field if non-nil, zero value otherwise.

### GetRoleOk

`func (o *AnthropicMessageStartEventDataMessage) GetRoleOk() (*string, bool)`

GetRoleOk returns a tuple with the Role field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRole

`func (o *AnthropicMessageStartEventDataMessage) SetRole(v string)`

SetRole sets Role field to given value.

### HasRole

`func (o *AnthropicMessageStartEventDataMessage) HasRole() bool`

HasRole returns a boolean if a field has been set.

### GetModel

`func (o *AnthropicMessageStartEventDataMessage) GetModel() string`

GetModel returns the Model field if non-nil, zero value otherwise.

### GetModelOk

`func (o *AnthropicMessageStartEventDataMessage) GetModelOk() (*string, bool)`

GetModelOk returns a tuple with the Model field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetModel

`func (o *AnthropicMessageStartEventDataMessage) SetModel(v string)`

SetModel sets Model field to given value.

### HasModel

`func (o *AnthropicMessageStartEventDataMessage) HasModel() bool`

HasModel returns a boolean if a field has been set.

### GetContent

`func (o *AnthropicMessageStartEventDataMessage) GetContent() []AnthropicContentBlock`

GetContent returns the Content field if non-nil, zero value otherwise.

### GetContentOk

`func (o *AnthropicMessageStartEventDataMessage) GetContentOk() (*[]AnthropicContentBlock, bool)`

GetContentOk returns a tuple with the Content field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetContent

`func (o *AnthropicMessageStartEventDataMessage) SetContent(v []AnthropicContentBlock)`

SetContent sets Content field to given value.

### HasContent

`func (o *AnthropicMessageStartEventDataMessage) HasContent() bool`

HasContent returns a boolean if a field has been set.

### GetStopReason

`func (o *AnthropicMessageStartEventDataMessage) GetStopReason() string`

GetStopReason returns the StopReason field if non-nil, zero value otherwise.

### GetStopReasonOk

`func (o *AnthropicMessageStartEventDataMessage) GetStopReasonOk() (*string, bool)`

GetStopReasonOk returns a tuple with the StopReason field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStopReason

`func (o *AnthropicMessageStartEventDataMessage) SetStopReason(v string)`

SetStopReason sets StopReason field to given value.

### HasStopReason

`func (o *AnthropicMessageStartEventDataMessage) HasStopReason() bool`

HasStopReason returns a boolean if a field has been set.

### GetStopSequence

`func (o *AnthropicMessageStartEventDataMessage) GetStopSequence() string`

GetStopSequence returns the StopSequence field if non-nil, zero value otherwise.

### GetStopSequenceOk

`func (o *AnthropicMessageStartEventDataMessage) GetStopSequenceOk() (*string, bool)`

GetStopSequenceOk returns a tuple with the StopSequence field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStopSequence

`func (o *AnthropicMessageStartEventDataMessage) SetStopSequence(v string)`

SetStopSequence sets StopSequence field to given value.

### HasStopSequence

`func (o *AnthropicMessageStartEventDataMessage) HasStopSequence() bool`

HasStopSequence returns a boolean if a field has been set.

### GetUsage

`func (o *AnthropicMessageStartEventDataMessage) GetUsage() AnthropicUsage`

GetUsage returns the Usage field if non-nil, zero value otherwise.

### GetUsageOk

`func (o *AnthropicMessageStartEventDataMessage) GetUsageOk() (*AnthropicUsage, bool)`

GetUsageOk returns a tuple with the Usage field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetUsage

`func (o *AnthropicMessageStartEventDataMessage) SetUsage(v AnthropicUsage)`

SetUsage sets Usage field to given value.

### HasUsage

`func (o *AnthropicMessageStartEventDataMessage) HasUsage() bool`

HasUsage returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


