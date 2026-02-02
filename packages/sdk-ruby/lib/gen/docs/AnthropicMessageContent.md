# AIStatsSdk::AnthropicMessageContent

## Class instance methods

### `openapi_one_of`

Returns the list of classes defined in oneOf.

#### Example

```ruby
require 'ai_stats_sdk'

AIStatsSdk::AnthropicMessageContent.openapi_one_of
# =>
# [
#   :'Array<AnthropicContentBlock>',
#   :'String'
# ]
```

### build

Find the appropriate object from the `openapi_one_of` list and casts the data into it.

#### Example

```ruby
require 'ai_stats_sdk'

AIStatsSdk::AnthropicMessageContent.build(data)
# => #<Array<AnthropicContentBlock>:0x00007fdd4aab02a0>

AIStatsSdk::AnthropicMessageContent.build(data_that_doesnt_match)
# => nil
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| **data** | **Mixed** | data to be matched against the list of oneOf items |

#### Return type

- `Array<AnthropicContentBlock>`
- `String`
- `nil` (if no type matches)

