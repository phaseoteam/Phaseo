# AIStatsSdk::ResponsesOutputItem

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **type** | **String** |  | [optional] |
| **id** | **String** |  | [optional] |
| **status** | **String** |  | [optional] |
| **role** | **String** |  | [optional] |
| **content** | [**Array&lt;ResponsesOutputContent&gt;**](ResponsesOutputContent.md) |  | [optional] |
| **call_id** | **String** |  | [optional] |
| **name** | **String** |  | [optional] |
| **arguments** | **String** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ResponsesOutputItem.new(
  type: null,
  id: null,
  status: null,
  role: null,
  content: null,
  call_id: null,
  name: null,
  arguments: null
)
```

