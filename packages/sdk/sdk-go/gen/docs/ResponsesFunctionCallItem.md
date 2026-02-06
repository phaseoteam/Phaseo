# ResponsesFunctionCallItem

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Type** | **string** |  | 
**CallId** | Pointer to **string** |  | [optional] 
**Name** | **string** |  | 
**Arguments** | **string** |  | 

## Methods

### NewResponsesFunctionCallItem

`func NewResponsesFunctionCallItem(type_ string, name string, arguments string, ) *ResponsesFunctionCallItem`

NewResponsesFunctionCallItem instantiates a new ResponsesFunctionCallItem object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewResponsesFunctionCallItemWithDefaults

`func NewResponsesFunctionCallItemWithDefaults() *ResponsesFunctionCallItem`

NewResponsesFunctionCallItemWithDefaults instantiates a new ResponsesFunctionCallItem object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetType

`func (o *ResponsesFunctionCallItem) GetType() string`

GetType returns the Type field if non-nil, zero value otherwise.

### GetTypeOk

`func (o *ResponsesFunctionCallItem) GetTypeOk() (*string, bool)`

GetTypeOk returns a tuple with the Type field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetType

`func (o *ResponsesFunctionCallItem) SetType(v string)`

SetType sets Type field to given value.


### GetCallId

`func (o *ResponsesFunctionCallItem) GetCallId() string`

GetCallId returns the CallId field if non-nil, zero value otherwise.

### GetCallIdOk

`func (o *ResponsesFunctionCallItem) GetCallIdOk() (*string, bool)`

GetCallIdOk returns a tuple with the CallId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCallId

`func (o *ResponsesFunctionCallItem) SetCallId(v string)`

SetCallId sets CallId field to given value.

### HasCallId

`func (o *ResponsesFunctionCallItem) HasCallId() bool`

HasCallId returns a boolean if a field has been set.

### GetName

`func (o *ResponsesFunctionCallItem) GetName() string`

GetName returns the Name field if non-nil, zero value otherwise.

### GetNameOk

`func (o *ResponsesFunctionCallItem) GetNameOk() (*string, bool)`

GetNameOk returns a tuple with the Name field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetName

`func (o *ResponsesFunctionCallItem) SetName(v string)`

SetName sets Name field to given value.


### GetArguments

`func (o *ResponsesFunctionCallItem) GetArguments() string`

GetArguments returns the Arguments field if non-nil, zero value otherwise.

### GetArgumentsOk

`func (o *ResponsesFunctionCallItem) GetArgumentsOk() (*string, bool)`

GetArgumentsOk returns a tuple with the Arguments field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetArguments

`func (o *ResponsesFunctionCallItem) SetArguments(v string)`

SetArguments sets Arguments field to given value.



[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


