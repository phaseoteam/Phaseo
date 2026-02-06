# AIStatsSdk::ChatMessageContent

## Class instance methods

### `openapi_one_of`

Returns the list of classes defined in oneOf.

#### Example

```ruby
require 'ai_stats_sdk'

AIStatsSdk::ChatMessageContent.openapi_one_of
# =>
# [
#   :'Array<MessageContentPart>',
#   :'String'
# ]
```

### build

Find the appropriate object from the `openapi_one_of` list and casts the data into it.

#### Example

```ruby
require 'ai_stats_sdk'

AIStatsSdk::ChatMessageContent.build(data)
# => #<Array<MessageContentPart>:0x00007fdd4aab02a0>

AIStatsSdk::ChatMessageContent.build(data_that_doesnt_match)
# => nil
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| **data** | **Mixed** | data to be matched against the list of oneOf items |

#### Return type

- `Array<MessageContentPart>`
- `String`
- `nil` (if no type matches)

