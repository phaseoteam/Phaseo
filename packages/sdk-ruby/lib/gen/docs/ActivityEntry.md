# AIStatsSdk::ActivityEntry

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **request_id** | **String** |  | [optional] |
| **provider** | **String** |  | [optional] |
| **model** | **String** |  | [optional] |
| **endpoint** | **String** |  | [optional] |
| **usage** | [**ActivityEntryUsage**](ActivityEntryUsage.md) |  | [optional] |
| **cost_cents** | **Float** |  | [optional] |
| **latency_ms** | **Integer** |  | [optional] |
| **timestamp** | **Time** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ActivityEntry.new(
  request_id: req_abc123,
  provider: openai,
  model: gpt-4o,
  endpoint: chat.completions,
  usage: null,
  cost_cents: 0.015,
  latency_ms: 450,
  timestamp: 2026-01-20T10:30Z
)
```

