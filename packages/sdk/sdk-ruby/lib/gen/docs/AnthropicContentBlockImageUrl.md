# AIStatsSdk::AnthropicContentBlockImageUrl

## Class instance methods

### `openapi_one_of`

Returns the list of classes defined in oneOf.

#### Example

```ruby
require 'ai_stats_sdk'

AIStatsSdk::AnthropicContentBlockImageUrl.openapi_one_of
# =>
# [
#   :'AnthropicContentBlockImageUrlOneOf',
#   :'String'
# ]
```

### build

Find the appropriate object from the `openapi_one_of` list and casts the data into it.

#### Example

```ruby
require 'ai_stats_sdk'

AIStatsSdk::AnthropicContentBlockImageUrl.build(data)
# => #<AnthropicContentBlockImageUrlOneOf:0x00007fdd4aab02a0>

AIStatsSdk::AnthropicContentBlockImageUrl.build(data_that_doesnt_match)
# => nil
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| **data** | **Mixed** | data to be matched against the list of oneOf items |

#### Return type

- `AnthropicContentBlockImageUrlOneOf`
- `String`
- `nil` (if no type matches)

