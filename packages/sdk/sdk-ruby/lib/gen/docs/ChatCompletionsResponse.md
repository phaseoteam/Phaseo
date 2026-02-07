# AIStatsSdk::ChatCompletionsResponse

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **id** | **String** |  | [optional] |
| **object** | **String** |  | [optional] |
| **created** | **Integer** |  | [optional] |
| **model** | **String** |  | [optional] |
| **choices** | [**Array&lt;ChatChoice&gt;**](ChatChoice.md) |  | [optional] |
| **usage** | [**Usage**](Usage.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ChatCompletionsResponse.new(
  id: null,
  object: null,
  created: null,
  model: null,
  choices: null,
  usage: null
)
```

