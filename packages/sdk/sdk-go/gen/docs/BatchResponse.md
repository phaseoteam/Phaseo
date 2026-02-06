# BatchResponse

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Id** | Pointer to **string** |  | [optional] 
**Object** | Pointer to **string** |  | [optional] 
**Endpoint** | Pointer to **string** |  | [optional] 
**Errors** | Pointer to **map[string]interface{}** |  | [optional] 
**InputFileId** | Pointer to **string** |  | [optional] 
**CompletionWindow** | Pointer to **string** |  | [optional] 
**Status** | Pointer to **string** |  | [optional] 
**OutputFileId** | Pointer to **string** |  | [optional] 
**ErrorFileId** | Pointer to **string** |  | [optional] 
**CreatedAt** | Pointer to **int32** |  | [optional] 
**InProgressAt** | Pointer to **int32** |  | [optional] 
**ExpiresAt** | Pointer to **int32** |  | [optional] 
**FinalizingAt** | Pointer to **int32** |  | [optional] 
**CompletedAt** | Pointer to **int32** |  | [optional] 
**FailedAt** | Pointer to **int32** |  | [optional] 
**ExpiredAt** | Pointer to **int32** |  | [optional] 
**CancellingAt** | Pointer to **int32** |  | [optional] 
**CancelledAt** | Pointer to **int32** |  | [optional] 
**RequestCounts** | Pointer to [**BatchRequestCounts**](BatchRequestCounts.md) |  | [optional] 
**Metadata** | Pointer to **map[string]interface{}** |  | [optional] 

## Methods

### NewBatchResponse

`func NewBatchResponse() *BatchResponse`

NewBatchResponse instantiates a new BatchResponse object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewBatchResponseWithDefaults

`func NewBatchResponseWithDefaults() *BatchResponse`

NewBatchResponseWithDefaults instantiates a new BatchResponse object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetId

`func (o *BatchResponse) GetId() string`

GetId returns the Id field if non-nil, zero value otherwise.

### GetIdOk

`func (o *BatchResponse) GetIdOk() (*string, bool)`

GetIdOk returns a tuple with the Id field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetId

`func (o *BatchResponse) SetId(v string)`

SetId sets Id field to given value.

### HasId

`func (o *BatchResponse) HasId() bool`

HasId returns a boolean if a field has been set.

### GetObject

`func (o *BatchResponse) GetObject() string`

GetObject returns the Object field if non-nil, zero value otherwise.

### GetObjectOk

`func (o *BatchResponse) GetObjectOk() (*string, bool)`

GetObjectOk returns a tuple with the Object field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetObject

`func (o *BatchResponse) SetObject(v string)`

SetObject sets Object field to given value.

### HasObject

`func (o *BatchResponse) HasObject() bool`

HasObject returns a boolean if a field has been set.

### GetEndpoint

`func (o *BatchResponse) GetEndpoint() string`

GetEndpoint returns the Endpoint field if non-nil, zero value otherwise.

### GetEndpointOk

`func (o *BatchResponse) GetEndpointOk() (*string, bool)`

GetEndpointOk returns a tuple with the Endpoint field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetEndpoint

`func (o *BatchResponse) SetEndpoint(v string)`

SetEndpoint sets Endpoint field to given value.

### HasEndpoint

`func (o *BatchResponse) HasEndpoint() bool`

HasEndpoint returns a boolean if a field has been set.

### GetErrors

`func (o *BatchResponse) GetErrors() map[string]interface{}`

GetErrors returns the Errors field if non-nil, zero value otherwise.

### GetErrorsOk

`func (o *BatchResponse) GetErrorsOk() (*map[string]interface{}, bool)`

GetErrorsOk returns a tuple with the Errors field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetErrors

`func (o *BatchResponse) SetErrors(v map[string]interface{})`

SetErrors sets Errors field to given value.

### HasErrors

`func (o *BatchResponse) HasErrors() bool`

HasErrors returns a boolean if a field has been set.

### GetInputFileId

`func (o *BatchResponse) GetInputFileId() string`

GetInputFileId returns the InputFileId field if non-nil, zero value otherwise.

### GetInputFileIdOk

`func (o *BatchResponse) GetInputFileIdOk() (*string, bool)`

GetInputFileIdOk returns a tuple with the InputFileId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputFileId

`func (o *BatchResponse) SetInputFileId(v string)`

SetInputFileId sets InputFileId field to given value.

### HasInputFileId

`func (o *BatchResponse) HasInputFileId() bool`

HasInputFileId returns a boolean if a field has been set.

### GetCompletionWindow

`func (o *BatchResponse) GetCompletionWindow() string`

GetCompletionWindow returns the CompletionWindow field if non-nil, zero value otherwise.

### GetCompletionWindowOk

`func (o *BatchResponse) GetCompletionWindowOk() (*string, bool)`

GetCompletionWindowOk returns a tuple with the CompletionWindow field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCompletionWindow

`func (o *BatchResponse) SetCompletionWindow(v string)`

SetCompletionWindow sets CompletionWindow field to given value.

### HasCompletionWindow

`func (o *BatchResponse) HasCompletionWindow() bool`

HasCompletionWindow returns a boolean if a field has been set.

### GetStatus

`func (o *BatchResponse) GetStatus() string`

GetStatus returns the Status field if non-nil, zero value otherwise.

### GetStatusOk

`func (o *BatchResponse) GetStatusOk() (*string, bool)`

GetStatusOk returns a tuple with the Status field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetStatus

`func (o *BatchResponse) SetStatus(v string)`

SetStatus sets Status field to given value.

### HasStatus

`func (o *BatchResponse) HasStatus() bool`

HasStatus returns a boolean if a field has been set.

### GetOutputFileId

`func (o *BatchResponse) GetOutputFileId() string`

GetOutputFileId returns the OutputFileId field if non-nil, zero value otherwise.

### GetOutputFileIdOk

`func (o *BatchResponse) GetOutputFileIdOk() (*string, bool)`

GetOutputFileIdOk returns a tuple with the OutputFileId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOutputFileId

`func (o *BatchResponse) SetOutputFileId(v string)`

SetOutputFileId sets OutputFileId field to given value.

### HasOutputFileId

`func (o *BatchResponse) HasOutputFileId() bool`

HasOutputFileId returns a boolean if a field has been set.

### GetErrorFileId

`func (o *BatchResponse) GetErrorFileId() string`

GetErrorFileId returns the ErrorFileId field if non-nil, zero value otherwise.

### GetErrorFileIdOk

`func (o *BatchResponse) GetErrorFileIdOk() (*string, bool)`

GetErrorFileIdOk returns a tuple with the ErrorFileId field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetErrorFileId

`func (o *BatchResponse) SetErrorFileId(v string)`

SetErrorFileId sets ErrorFileId field to given value.

### HasErrorFileId

`func (o *BatchResponse) HasErrorFileId() bool`

HasErrorFileId returns a boolean if a field has been set.

### GetCreatedAt

`func (o *BatchResponse) GetCreatedAt() int32`

GetCreatedAt returns the CreatedAt field if non-nil, zero value otherwise.

### GetCreatedAtOk

`func (o *BatchResponse) GetCreatedAtOk() (*int32, bool)`

GetCreatedAtOk returns a tuple with the CreatedAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCreatedAt

`func (o *BatchResponse) SetCreatedAt(v int32)`

SetCreatedAt sets CreatedAt field to given value.

### HasCreatedAt

`func (o *BatchResponse) HasCreatedAt() bool`

HasCreatedAt returns a boolean if a field has been set.

### GetInProgressAt

`func (o *BatchResponse) GetInProgressAt() int32`

GetInProgressAt returns the InProgressAt field if non-nil, zero value otherwise.

### GetInProgressAtOk

`func (o *BatchResponse) GetInProgressAtOk() (*int32, bool)`

GetInProgressAtOk returns a tuple with the InProgressAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInProgressAt

`func (o *BatchResponse) SetInProgressAt(v int32)`

SetInProgressAt sets InProgressAt field to given value.

### HasInProgressAt

`func (o *BatchResponse) HasInProgressAt() bool`

HasInProgressAt returns a boolean if a field has been set.

### GetExpiresAt

`func (o *BatchResponse) GetExpiresAt() int32`

GetExpiresAt returns the ExpiresAt field if non-nil, zero value otherwise.

### GetExpiresAtOk

`func (o *BatchResponse) GetExpiresAtOk() (*int32, bool)`

GetExpiresAtOk returns a tuple with the ExpiresAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetExpiresAt

`func (o *BatchResponse) SetExpiresAt(v int32)`

SetExpiresAt sets ExpiresAt field to given value.

### HasExpiresAt

`func (o *BatchResponse) HasExpiresAt() bool`

HasExpiresAt returns a boolean if a field has been set.

### GetFinalizingAt

`func (o *BatchResponse) GetFinalizingAt() int32`

GetFinalizingAt returns the FinalizingAt field if non-nil, zero value otherwise.

### GetFinalizingAtOk

`func (o *BatchResponse) GetFinalizingAtOk() (*int32, bool)`

GetFinalizingAtOk returns a tuple with the FinalizingAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFinalizingAt

`func (o *BatchResponse) SetFinalizingAt(v int32)`

SetFinalizingAt sets FinalizingAt field to given value.

### HasFinalizingAt

`func (o *BatchResponse) HasFinalizingAt() bool`

HasFinalizingAt returns a boolean if a field has been set.

### GetCompletedAt

`func (o *BatchResponse) GetCompletedAt() int32`

GetCompletedAt returns the CompletedAt field if non-nil, zero value otherwise.

### GetCompletedAtOk

`func (o *BatchResponse) GetCompletedAtOk() (*int32, bool)`

GetCompletedAtOk returns a tuple with the CompletedAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCompletedAt

`func (o *BatchResponse) SetCompletedAt(v int32)`

SetCompletedAt sets CompletedAt field to given value.

### HasCompletedAt

`func (o *BatchResponse) HasCompletedAt() bool`

HasCompletedAt returns a boolean if a field has been set.

### GetFailedAt

`func (o *BatchResponse) GetFailedAt() int32`

GetFailedAt returns the FailedAt field if non-nil, zero value otherwise.

### GetFailedAtOk

`func (o *BatchResponse) GetFailedAtOk() (*int32, bool)`

GetFailedAtOk returns a tuple with the FailedAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetFailedAt

`func (o *BatchResponse) SetFailedAt(v int32)`

SetFailedAt sets FailedAt field to given value.

### HasFailedAt

`func (o *BatchResponse) HasFailedAt() bool`

HasFailedAt returns a boolean if a field has been set.

### GetExpiredAt

`func (o *BatchResponse) GetExpiredAt() int32`

GetExpiredAt returns the ExpiredAt field if non-nil, zero value otherwise.

### GetExpiredAtOk

`func (o *BatchResponse) GetExpiredAtOk() (*int32, bool)`

GetExpiredAtOk returns a tuple with the ExpiredAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetExpiredAt

`func (o *BatchResponse) SetExpiredAt(v int32)`

SetExpiredAt sets ExpiredAt field to given value.

### HasExpiredAt

`func (o *BatchResponse) HasExpiredAt() bool`

HasExpiredAt returns a boolean if a field has been set.

### GetCancellingAt

`func (o *BatchResponse) GetCancellingAt() int32`

GetCancellingAt returns the CancellingAt field if non-nil, zero value otherwise.

### GetCancellingAtOk

`func (o *BatchResponse) GetCancellingAtOk() (*int32, bool)`

GetCancellingAtOk returns a tuple with the CancellingAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCancellingAt

`func (o *BatchResponse) SetCancellingAt(v int32)`

SetCancellingAt sets CancellingAt field to given value.

### HasCancellingAt

`func (o *BatchResponse) HasCancellingAt() bool`

HasCancellingAt returns a boolean if a field has been set.

### GetCancelledAt

`func (o *BatchResponse) GetCancelledAt() int32`

GetCancelledAt returns the CancelledAt field if non-nil, zero value otherwise.

### GetCancelledAtOk

`func (o *BatchResponse) GetCancelledAtOk() (*int32, bool)`

GetCancelledAtOk returns a tuple with the CancelledAt field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCancelledAt

`func (o *BatchResponse) SetCancelledAt(v int32)`

SetCancelledAt sets CancelledAt field to given value.

### HasCancelledAt

`func (o *BatchResponse) HasCancelledAt() bool`

HasCancelledAt returns a boolean if a field has been set.

### GetRequestCounts

`func (o *BatchResponse) GetRequestCounts() BatchRequestCounts`

GetRequestCounts returns the RequestCounts field if non-nil, zero value otherwise.

### GetRequestCountsOk

`func (o *BatchResponse) GetRequestCountsOk() (*BatchRequestCounts, bool)`

GetRequestCountsOk returns a tuple with the RequestCounts field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetRequestCounts

`func (o *BatchResponse) SetRequestCounts(v BatchRequestCounts)`

SetRequestCounts sets RequestCounts field to given value.

### HasRequestCounts

`func (o *BatchResponse) HasRequestCounts() bool`

HasRequestCounts returns a boolean if a field has been set.

### GetMetadata

`func (o *BatchResponse) GetMetadata() map[string]interface{}`

GetMetadata returns the Metadata field if non-nil, zero value otherwise.

### GetMetadataOk

`func (o *BatchResponse) GetMetadataOk() (*map[string]interface{}, bool)`

GetMetadataOk returns a tuple with the Metadata field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetMetadata

`func (o *BatchResponse) SetMetadata(v map[string]interface{})`

SetMetadata sets Metadata field to given value.

### HasMetadata

`func (o *BatchResponse) HasMetadata() bool`

HasMetadata returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


