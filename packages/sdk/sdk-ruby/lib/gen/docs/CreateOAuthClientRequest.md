# AIStatsSdk::CreateOAuthClientRequest

## Properties

| Name | Type | Description | Notes |
| ---- | ---- | ----------- | ----- |
| **name** | **String** |  |  |
| **description** | **String** |  | [optional] |
| **homepage_url** | **String** |  | [optional] |
| **redirect_uris** | **Array&lt;String&gt;** |  |  |
| **logo_url** | **String** |  | [optional] |
| **privacy_policy_url** | **String** |  | [optional] |
| **terms_of_service_url** | **String** |  | [optional] |

## Example

```ruby
require 'ai_stats_sdk'

instance = AIStatsSdk::CreateOAuthClientRequest.new(
  name: null,
  description: null,
  homepage_url: null,
  redirect_uris: null,
  logo_url: null,
  privacy_policy_url: null,
  terms_of_service_url: null
)
```

