# ToolCallFunction

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Name** | Pointer to **string** |  | [optional] 
**Arguments** | Pointer to **string** |  | [optional] 
**Description** | Pointer to **string** |  | [optional] 
**Parameters** | Pointer to **map[string]interface{}** |  | [optional] 

## Methods

### NewToolCallFunction

`func NewToolCallFunction() *ToolCallFunction`

NewToolCallFunction instantiates a new ToolCallFunction object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewToolCallFunctionWithDefaults

`func NewToolCallFunctionWithDefaults() *ToolCallFunction`

NewToolCallFunctionWithDefaults instantiates a new ToolCallFunction object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetName

`func (o *ToolCallFunction) GetName() string`

GetName returns the Name field if non-nil, zero value otherwise.

### GetNameOk

`func (o *ToolCallFunction) GetNameOk() (*string, bool)`

GetNameOk returns a tuple with the Name field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetName

`func (o *ToolCallFunction) SetName(v string)`

SetName sets Name field to given value.

### HasName

`func (o *ToolCallFunction) HasName() bool`

HasName returns a boolean if a field has been set.

### GetArguments

`func (o *ToolCallFunction) GetArguments() string`

GetArguments returns the Arguments field if non-nil, zero value otherwise.

### GetArgumentsOk

`func (o *ToolCallFunction) GetArgumentsOk() (*string, bool)`

GetArgumentsOk returns a tuple with the Arguments field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetArguments

`func (o *ToolCallFunction) SetArguments(v string)`

SetArguments sets Arguments field to given value.

### HasArguments

`func (o *ToolCallFunction) HasArguments() bool`

HasArguments returns a boolean if a field has been set.

### GetDescription

`func (o *ToolCallFunction) GetDescription() string`

GetDescription returns the Description field if non-nil, zero value otherwise.

### GetDescriptionOk

`func (o *ToolCallFunction) GetDescriptionOk() (*string, bool)`

GetDescriptionOk returns a tuple with the Description field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetDescription

`func (o *ToolCallFunction) SetDescription(v string)`

SetDescription sets Description field to given value.

### HasDescription

`func (o *ToolCallFunction) HasDescription() bool`

HasDescription returns a boolean if a field has been set.

### GetParameters

`func (o *ToolCallFunction) GetParameters() map[string]interface{}`

GetParameters returns the Parameters field if non-nil, zero value otherwise.

### GetParametersOk

`func (o *ToolCallFunction) GetParametersOk() (*map[string]interface{}, bool)`

GetParametersOk returns a tuple with the Parameters field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetParameters

`func (o *ToolCallFunction) SetParameters(v map[string]interface{})`

SetParameters sets Parameters field to given value.

### HasParameters

`func (o *ToolCallFunction) HasParameters() bool`

HasParameters returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


