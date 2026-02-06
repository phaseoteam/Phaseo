# AIStatsSdk.Model.ChatCompletionsStreamEvent
Server-Sent Event wrapper. Wire format is `event: <optional>\\ndata: <json>\\n\\n`. Most Chat Completions streams only send data lines. 

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Event** | **string** |  | [optional] 
**Data** | [**ChatCompletionsStreamChunk**](ChatCompletionsStreamChunk.md) |  | [optional] 

[[Back to Model list]](../../README.md#documentation-for-models) [[Back to API list]](../../README.md#documentation-for-api-endpoints) [[Back to README]](../../README.md)

