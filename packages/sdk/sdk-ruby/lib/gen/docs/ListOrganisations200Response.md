# AIStatsSdk::ListOrganisations200Response

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **ok** | **Boolean** |  | [optional] |
| **limit** | **Integer** |  | [optional] |
| **offset** | **Integer** |  | [optional] |
| **total** | **Integer** |  | [optional] |
| **organisations** | [**Array&lt;ListOrganisations200ResponseOrganisationsInner&gt;**](ListOrganisations200ResponseOrganisationsInner.md) |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::ListOrganisations200Response.new(
  ok: true,
  limit: 50,
  offset: 0,
  total: 10,
  organisations: null
)
```

