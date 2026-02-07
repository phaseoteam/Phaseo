# AIStatsSdk::ResponsesResponse

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  | [optional] |
| **object** | **String** |  | [optional] |
| **created** | **Integer** |  | [optional] |
| **model** | **String** |  | [optional] |
| **content** | **Array&lt;Object&gt;** |  | [optional] |
| **role** | **String** |  | [optional] |
| **stop_reason** | **String** |  | [optional] |
| **type** | **String** |  | [optional] |
| **usage** | [**Usage**](Usage.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ResponsesResponse.new(
  id: null,
  object: null,
  created: null,
  model: null,
  content: null,
  role: null,
  stop_reason: null,
  type: null,
  usage: null
)
```

