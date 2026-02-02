# AIStatsSdk::ErrorResponse

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **ok** | **Boolean** |  | [optional] |
| **error** | **String** |  | [optional] |
| **message** | **String** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ErrorResponse.new(
  ok: false,
  error: error_type,
  message: Human-readable error message
)
```

