# AIStatsSdk::ListProviders200Response

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **ok** | **Boolean** |  | [optional] |
| **limit** | **Integer** |  | [optional] |
| **offset** | **Integer** |  | [optional] |
| **total** | **Integer** |  | [optional] |
| **providers** | [**Array&lt;Provider&gt;**](Provider.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ListProviders200Response.new(
  ok: true,
  limit: 50,
  offset: 0,
  total: 25,
  providers: null
)
```

