# AIStatsSdk::GetActivity200Response

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **ok** | **Boolean** |  | [optional] |
| **period_days** | **Integer** |  | [optional] |
| **limit** | **Integer** |  | [optional] |
| **offset** | **Integer** |  | [optional] |
| **total** | **Integer** |  | [optional] |
| **total_cost_cents** | **Float** |  | [optional] |
| **activity** | [**Array&lt;ActivityEntry&gt;**](ActivityEntry.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::GetActivity200Response.new(
  ok: true,
  period_days: 30,
  limit: 50,
  offset: 0,
  total: 1250,
  total_cost_cents: 12.5,
  activity: null
)
```

