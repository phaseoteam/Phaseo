# AIStatsSdk::ListModels200Response

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **ok** | **Boolean** |  | [optional] |
| **limit** | **Integer** |  | [optional] |
| **offset** | **Integer** |  | [optional] |
| **total** | **Integer** |  | [optional] |
| **models** | [**Array&lt;Model&gt;**](Model.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ListModels200Response.new(
  ok: null,
  limit: null,
  offset: null,
  total: null,
  models: null
)
```

