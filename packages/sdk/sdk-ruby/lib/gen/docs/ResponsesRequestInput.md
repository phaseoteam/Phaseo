# AIStatsSdk::ResponsesRequestInput

## Class instance methods

### `openapi_one_of`

Returns the list of classes defined in oneOf.

#### Example

```ruby
require 'ai_stats_sdk'

AIStatsSdk::ResponsesRequestInput.openapi_one_of
# =>
# [
#   :'Array<ResponsesInputItem>',
#   :'Object',
#   :'String'
# ]
```

### build

Find the appropriate object from the `openapi_one_of` list and casts the data into it.

#### Example

```ruby
require 'ai_stats_sdk'

AIStatsSdk::ResponsesRequestInput.build(data)
# => #<Array<ResponsesInputItem>:0x00007fdd4aab02a0>

AIStatsSdk::ResponsesRequestInput.build(data_that_doesnt_match)
# => nil
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| **data** | **Mixed** | data to be matched against the list of oneOf items |

#### Return type

- `Array<ResponsesInputItem>`
- `Object`
- `String`
- `nil` (if no type matches)

