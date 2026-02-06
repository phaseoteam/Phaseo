# AIStatsSdk::AnthropicUsage

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **input_tokens** | **Integer** |  | [optional] |
| **output_tokens** | **Integer** |  | [optional] |
| **cache_creation** | **Object** |  | [optional] |
| **cache_creation_input_tokens** | **Integer** |  | [optional] |
| **cache_read_input_tokens** | **Integer** |  | [optional] |
| **server_tool_use** | **Boolean** |  | [optional] |
| **service_tier** | **String** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::AnthropicUsage.new(
  input_tokens: null,
  output_tokens: null,
  cache_creation: null,
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  server_tool_use: null,
  service_tier: null
)
```

